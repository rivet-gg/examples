import { Server as SocketServer, Socket } from "socket.io";
import { Connection } from "./Connection";
import { RivetClient } from "@rivet-gg/api";

export class Server {
	public static shared: Server;

	public static rivet = new RivetClient({
		token: process.env.RIVET_TOKEN,
	});

	public constructor(public socketServer: SocketServer) {
		this.socketServer.on("connection", this._onConnection.bind(this));

		Server.rivet.matchmaker.lobbies.ready();
	}

	private async _onConnection(socket: Socket) {
		new Connection(this, socket);
	}
}
