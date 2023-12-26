// Import demo room handlers
import { LobbyRoom, RelayRoom } from "colyseus";
import { ChatRoom } from "./rooms/01-chat-room";
import { StateHandlerRoom } from "./rooms/02-state-handler";
import { AuthRoom } from "./rooms/03-auth";
import { ReconnectionRoom } from "./rooms/04-reconnection";
import { CustomLobbyRoom } from "./rooms/07-custom-lobby-room";

export default {
	getId: () => "My Colyseus App",

	// initializeTransport: (options) => new uWebSocketsTransport(options),

	initializeGameServer: async (gameServer) => {
		// Define "lobby" room
		gameServer.define("lobby", LobbyRoom);

		// Define "relay" room
		gameServer
			.define("relay", RelayRoom, { maxClients: 4 })
			.enableRealtimeListing();

		// Define "chat" room
		gameServer.define("chat", ChatRoom).enableRealtimeListing();

		// Register ChatRoom with initial options, as "chat_with_options"
		// onInit(options) will receive client join options + options registered here.
		gameServer.define("chat_with_options", ChatRoom, {
			custom_options: "you can use me on Room#onCreate",
		});

		// Define "state_handler" room
		gameServer
			.define("state_handler", StateHandlerRoom)
			.enableRealtimeListing();

		// Define "auth" room
		gameServer.define("auth", AuthRoom).enableRealtimeListing();

		// Define "reconnection" room
		gameServer
			.define("reconnection", ReconnectionRoom)
			.enableRealtimeListing();

		// Define "custom_lobby" room
		gameServer.define("custom_lobby", CustomLobbyRoom);

		gameServer.onShutdown(function () {
			console.log(`game server is going down.`);
		});
	},

	beforeListen: async () => {
		/**
		 * Before before gameServer.listen() is called.
		 */
	},
};
