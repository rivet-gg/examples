import { Server as SocketServer, Socket } from "socket.io";
import { createGame, updateGame } from "../shared/Game";
import { Connection } from "./Connection";

import { RivetClient } from "@rivet-gg/api";
export const RIVET = new RivetClient({ token: process.env.RIVET_TOKEN });

// Notify Rivet that this lobby is ready to accept players
RIVET.matchmaker.lobbies.ready();

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
	// Read the token passed to the socket query
	const playerToken = socket.handshake.query.token as string;

	// Validate the player token with the matchmaker
	await RIVET.matchmaker.players.connected({ playerToken });

	// Remove the player when disconnected
	socket.on("disconnect", () =>
		RIVET.matchmaker.players.disconnected({ playerToken }),
	);

	new Connection(game, socket);
}

// Update game & broadcast state
setInterval(() => {
	updateGame(game);
	socketServer.emit("update", game.state);
}, 50);

console.log(`Listening on port ${port}`);
