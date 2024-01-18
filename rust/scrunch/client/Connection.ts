import { float, int } from "./types";
import msgpack = require("msgpack-lite");
import { EntityInitData, EntityUpdateData, EntityId } from "./entities/EntityData";
import { Game } from "./Game";
import { RivetClient } from "@rivet-gg/api";

type JoinData = int;
type UpdateData = [int, EntityInitData[], EntityUpdateData[], EntityId[], EntityId[]];

enum IncomingMessageType {
    Join = 0,
    Update = 1
}

enum OutgoingMessageType {
    Auth = 0,
    Join = 1,
    Move = 2
}

const RIVET = new RivetClient({
    environment: process.env.RIVET_API_ENDPOINT,
    token: process.env.RIVET_TOKEN,
});

export class Connection {
    // Socket components
    private socket?: WebSocket;

    private playerToken?: string;

    public constructor() {
        this.connect();
    }

    private async connect() {
        document.getElementById("loadingState").innerText = "Finding lobby...";

        let res = await RIVET.matchmaker.lobbies.find({ gameModes: ["default"] });
        let port = res.ports.default;
        this.playerToken = res.player.token;

        document.getElementById("loadingState").innerText = "Connecting...";

        // Create the server
        const protocol = port.isTls ? "wss:" : "ws:";
        this.socket = new WebSocket(`${protocol}//${port.host}`);
        this.socket.binaryType = "arraybuffer";

        // Register the callbacks
        this.socket.onclose = e => this.onClose(e);
        this.socket.onerror = e => this.onError(e);
        this.socket.onmessage = e => this.onMessage(e);
        this.socket.onopen = e => this.onOpen(e);

        // // Ping the server every few seconds
        // this.pingHandle = setInterval(() => {
        //     this.sendPing();
        // }, 1000);
    }

    private onConnectionEnded() {
        // // Stop pinging the server
        // clearTimeout(this.pingHandle);
        //
        // // Change the state appropriately
        // if (this.switchingServers) {
        //     MainGUI.shared.setGUIState(GUIState.SwitchingServer);
        // } else if (MainGUI.shared.state.state != GUIState.Kicked) {
        //     MainGUI.shared.setGUIState(GUIState.Disconnected);
        // }
    }

    private onClose(event: CloseEvent) {
        console.log("Socket closed");

        this.onConnectionEnded();
    }

    private onError(event: Event) {
        console.log("Socket error", event);

        this.onConnectionEnded();
    }

    private onMessage(event: MessageEvent) {
        // Parse the data to JSON
        let messageData: [int, any];
        let length: number;
        try {
            // Parse the message; need to wrap data in Uint8Array to make it work; see
            // https://github.com/kawanet/msgpack-lite/issues/44
            const data = new Uint8Array(event.data);
            messageData = msgpack.decode(data);
            length = data.length;
        } catch(error) {
            console.error("Could not parse message", event.data, error);
            return;
        }

        // Get parameters from the message
        let type: IncomingMessageType = messageData[0];
        let data = messageData[1];

        // Make sure it has the correct type
        if (typeof type == undefined) {
            console.warn("No type in message", data);
            return;
        }

        // Act on the message type
        switch (type) {
            case IncomingMessageType.Join:
                this.onJoin(data);
                break;
            case IncomingMessageType.Update:
                this.onUpdate(data);
                break;
            default:
                console.error(`Unknown message type ${type}`)
                break;
        }
    }

    private onOpen(event: Event) {
        console.log("Open", event);

        document.getElementById("loadingState").innerText = "Press Enter to join";

        this.sendMessage(OutgoingMessageType.Auth, this.playerToken);

        // // Change the state
        // MainGUI.shared.setGUIState(GUIState.InitiatingGame);
        //
        // // Send handshake
        // this.send(this.OutgoingMessages.handshake, {
        //     key: "<<KEY>>",
        //     token: Storage.token
        // });
    }

    /* Senders */
    private sendMessage(type: OutgoingMessageType, data: any) {
        // Create the message
        let message = [type, data];

        // Send the data
        const binary = msgpack.encode(message);
        this.socket.send(binary);
    }

    public sendJoin(username: string) {
        this.sendMessage(OutgoingMessageType.Join, username);
    }

    public sendMove(x: int, y: int) {
        this.sendMessage(OutgoingMessageType.Move, [x, y]);
    }

    /* Events */
    public onJoin(data: JoinData) {
        let playerId = data;

        Game.shared.mainPlayerId = playerId;
        Game.shared.spectatingId = playerId;
    }

    private onUpdate(data: UpdateData) {
        Game.shared.mapSize = data[0];
        data[1].forEach(e => Game.shared.addEntity((e))); // Appeared entities
        data[2].forEach(e => Game.shared.updateEntity((e))); // Updated entities
        data[3].forEach(id => Game.shared.removeEntity(id, false)); // Disappeared entities
        data[4].forEach(id => Game.shared.removeEntity(id, true)); // Destroyed entities
    }
}
