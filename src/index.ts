import { Server } from 'ws';
import jwt from 'jsonwebtoken';

export default {
  register() {},

  async bootstrap({ strapi }) {
    const wss = new Server({ noServer: true });

    // Manually handle WebSocket upgrade requests
    strapi.server.httpServer.on("upgrade", (request, socket, head) => {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    });

    wss.on("connection", async (ws, req) => {
      try {
        const url = new URL(req.url || "", `http://${req.headers.host}`);
        const token = url.searchParams.get("token");

        if (!token) {
          console.log("❌ No token provided. Closing connection.");
          ws.close();
          return;
        }

        const decoded = jwt.verify(token, strapi.config.get("plugin.users-permissions.jwtSecret"));
        console.log("✅ User authenticated:", decoded);


        ws.on("message", async (message) => {
          try {
            let chatSession = await strapi.entityService.findMany("api::chat-session.chat-session", {
              filters: { user: decoded["id"] },
              sort: { createdAt: "desc" },
              limit: 1,
            });
  
          if (chatSession.length === 0) {
            chatSession = await strapi.entityService.create("api::chat-session.chat-session", {
              data: {
                title: `Session ${new Date().getTime.toString()}`,
                user: decoded["id"],
              },
            });
          } else {
            chatSession = chatSession[0];
          }


            let messageString: string;

            if (message instanceof Buffer) {
                messageString = message.toString("utf-8"); // Convert Buffer to String
            } else if (message instanceof ArrayBuffer) {
                messageString = new TextDecoder().decode(new Uint8Array(message));
            } else if (typeof message === "string") {
                messageString = message;
            } else {
                throw new Error("Unsupported WebSocket message format.");
            }
    
            console.log("Received message:", messageString);

            const parsedMessage = JSON.parse(messageString);
            const { sender, text } = parsedMessage;
            console.log(`Sender: ${sender}, Message: ${text}`);

            const chatMessage = await strapi.entityService.create("api::chat-message.chat-message", {
              data: {
                chatId: Math.floor(Math.random() * 1000).toString(),
                sender: sender,
                msg: text,
                timestamp: new Date(),
                user: decoded["id"],
                chat_session: chatSession.id, // Link message to session
              },
            });
            
            const botMessage = await strapi.entityService.create("api::chat-message.chat-message", {
              data: {
                chatId: Math.floor(Math.random() * 1000).toString(),
                sender: "bot",
                msg: `I received your message: ${text}`,
                timestamp: new Date(),
                user: decoded["id"],
                chat_session: chatSession.id, // Link message to session
              },
            });

            console.log("Message saved:", chatMessage);

            ws.send(JSON.stringify(chatMessage));
          } catch (error) {
            console.error("Error saving message:", error);
          }
        });
      } catch (err) {
        console.error("Authentication failed:", err);
        ws.close();
      }
    });

    console.log("WebSocket server running on production");
  },
};
