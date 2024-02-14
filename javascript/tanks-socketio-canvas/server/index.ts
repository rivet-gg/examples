import { Server as SocketServer, Socket } from "socket.io";
import { createGame, updateGame } from "../shared/Game";
import { Connection } from "./Connection";

// Create game
const game = createGame(true);

// Start server
const port = parseInt(process.env.PORT) || 3000;
const socketServer = new SocketServer(port, {
	cors: {
		// Once you deploy your own game, make sure the CORS is restrited to
		// your domain.
		origin: "*",
	},
});
socketServer.on("connection", setupConnection);

async function setupConnection(socket: Socket) {
	new Connection(game, socket);
}

// Update game & broadcast state
setInterval(() => {
	updateGame(game);
	socketServer.emit("update", game.state);
}, 50);

console.log(`Listening on port ${port}`);
