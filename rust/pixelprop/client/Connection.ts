import {float, int} from "./types";
import msgpack = require("msgpack-lite");
import {ClientEvent, Game} from "./Game";
import {EntityData, EntityId, EntityRotation} from "./Entity";
import {RectArray, VectorArray} from "./Utils";
import {Storage} from "./Storage";
import {generateUsername} from "./UsernameGenerationData";
import { RivetClient } from "@rivet-gg/api";

const RIVET = new RivetClient({
    environment: process.env.RIVET_API_ENDPOINT,
    token: process.env.RIVET_TOKEN,
});

type JoinData = [int, int];
type InitData = [string];
type UpdateData = [int, int, int, int, [string, RectArray][], ClientEvent[], EntityData[], EntityData[], EntityId[], EntityId[]];
type PingDelayData = float | undefined;
type ShootDelayData = float | undefined;
type StaminaData = float;

export type GameResultsData = [boolean, ScoreboardData, ScoreBreakdownData]; // Props win, scoreboard, score breakdown
export type ScoreboardData = [int, boolean, string, int][]; // Entity id, is prop, username, score
export type ScoreBreakdownData = ([string, string, int] | undefined)[]; // Translation key, count, score; this may be undefined to indicate a space

enum IncomingMessageType {
    Init = 0,
    Update = 1,
    PingDelay = 2,
    ShootDelay = 3,
    Stamina = 4,
    GameResults = 5
}

enum OutgoingMessageType {
    Auth = 0,
    Join = 1,
    Move = 2,
    FaceDir = 3,
    Rotate = 4,
    Shoot = 5,
    Select = 6,
    Jump = 7,
    ForcePing = 8,
    CheatCode = 9,
    TempData = 10
}

export class Connection {
    // Socket components
    private socket?: WebSocket;
    private playerToken?: string;
    private get isOpen(): boolean {
        return this.socket.readyState == WebSocket.OPEN;
    }
    public isDisconnected: boolean = false;

    public constructor() {

    }

    public async connect() {
        let res = await RIVET.matchmaker.lobbies.find({ gameModes: ["default"] });
        let port = res.ports.default;
        this.playerToken = res.player.token;

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

        this.isDisconnected = true;
        Game.shared.updateState();

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
            case IncomingMessageType.Init:
                this.onInit(data);
                break;
            case IncomingMessageType.Update:
                this.onUpdate(data);
                break;
            case IncomingMessageType.PingDelay:
                this.onPingDelay(data);
                break;
            case IncomingMessageType.ShootDelay:
                this.onShootDelay(data);
                break;
            case IncomingMessageType.Stamina:
                this.onStamina(data);
                break;
            case IncomingMessageType.GameResults:
                this.onGameResults(data);
                break;
            default:
                console.error(`Unknown message type ${type}`);
                break;
        }
    }

    private onOpen(event: Event) {
        console.log("Open", event);

        this.sendMessage(OutgoingMessageType.Auth, [this.playerToken]);

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
        if (!this.isOpen) {
            return;
        }

        // Create the message
        let message = [type, data];

        // Send the data
        const binary = msgpack.encode(message);
        this.socket.send(binary);
    }

    public sendJoin() {
        this.sendMessage(OutgoingMessageType.Join, [
            Storage.username || generateUsername(),
            Storage.characterId || Game.shared.storeData.characters[0].id
        ]);
    }

    public sendMove(dir: number | undefined, sprint: boolean) {
        this.sendMessage(OutgoingMessageType.Move, [dir, sprint]);
    }

    public sendFaceDir(dir: float) {
        this.sendMessage(OutgoingMessageType.FaceDir, dir);
    }

    public sendRotate(rot: EntityRotation) {
        this.sendMessage(OutgoingMessageType.Rotate, rot);
    }

    public sendShoot(target: BABYLON.Vector3) {
        this.sendMessage(OutgoingMessageType.Shoot, [target.x, target.y, target.z]);
    }

    public sendSelect(id: EntityId) {
        this.sendMessage(OutgoingMessageType.Select, id);
    }

    public sendJump() {
        this.sendMessage(OutgoingMessageType.Jump, undefined);
    }

    public sendForcePing() {
        this.sendMessage(OutgoingMessageType.ForcePing, undefined);
    }

    public sendCheatCode(data: string) {
        this.sendMessage(OutgoingMessageType.CheatCode, data);
    }

    public sendTempData(data: string) {
        this.sendMessage(OutgoingMessageType.TempData, data);
    }

    /**** TEMP METHODS ****/
    public tempDumpTree() {
        this.sendTempData("dump-tree:");
    }

    public tempSwitchServerState(state: int) {
        this.sendTempData("switch-state:" + state);
    }

    public tempSelectPlayerState(state: "hunter" | "prop") {
        this.sendTempData("switch-player-type:" + state);
    }

    public tempDuplicateObject() {
        this.sendTempData("duplicate-object:");
    }

    public tempSpawnAllProps() {
        this.sendTempData("spawn-all-props:");
    }

    public tempRoundPosition() {
        this.sendTempData("round-position:");
    }

    /* Events */
    private onInit(data: InitData) {
        Game.shared.storeData = JSON.parse(data[0]);
        console.log("Store data:", Game.shared.storeData);
    }

    private onUpdate(data: UpdateData) {
        const [playerId, spectatingId, state, stateTimer, minimap, events, added, updated, disappeared, removed] = data;

        // Player and spectating id
        Game.shared.mainPlayerId = playerId;
        Game.shared.spectatingId = spectatingId;

        // Game state
        Game.shared.gameServerState = state;
        Game.shared.gameStateTimer = stateTimer;

        // Minimap
        if (minimap != undefined) {
            Game.shared.gameGUI.minimap.applyData(minimap);
        }

        // Events
        events.forEach(e => Game.shared.handleClientEvent(e));

        // Entity updates
        added.forEach(e => Game.shared.addEntity(e)); // Appeared entities
        updated.forEach(e => Game.shared.updateEntity(e)); // Updated entities
        disappeared.forEach(id => Game.shared.removeEntity(id, false)); // Disappeared entities
        removed.forEach(id => Game.shared.removeEntity(id, true)); // Destroyed entities

        // Calculate metrics on the update
        // console.log(`Appeared: ${data[1].length}\nUpdates: ${data[2].length}\nDisappeared: ${data[3].length}\nDestroyed: ${data[4].length}`);
    }

    private onPingDelay(data: PingDelayData) {
        Game.shared.setPingDelay(data);
    }

    private onShootDelay(data: ShootDelayData) {
        Game.shared.setShootDelay(data);
    }

    private onStamina(data: StaminaData) {
        Game.shared.setStamina(data);
    }

    private onGameResults(data: GameResultsData) {
        Game.shared.gameGUI.displayGameResults(data);
    }
}
