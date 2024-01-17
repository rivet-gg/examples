import { Server } from "./Server";
import { Server as SocketServer } from "socket.io";
import { PORT_SIGNALING } from "./env";

const socketServer = new SocketServer(PORT_SIGNALING, {
	cors: {
		origin: "*",
	},
});
Server.shared = new Server(socketServer);
console.log(`Listening on port ${PORT_SIGNALING}`);
