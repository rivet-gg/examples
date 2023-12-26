import { Socket } from "socket.io";
import { createPlayer, PlayerState, shoot } from "../shared/Player";
import { Game } from "../shared/Game";

export class Connection {
	public currentPlayerId?: number;

	public get currentPlayer(): PlayerState | undefined {
		if (this.currentPlayerId) {
			return this._game.state.players[this.currentPlayerId];
		} else {
			return undefined;
		}
	}

	public constructor(private _game: Game, private _socket: Socket) {
		this._socket.on("disconnect", this._onDisconnect.bind(this));
		this._socket.on("join", this._onJoin.bind(this));
		this._socket.on("shoot", this._onShoot.bind(this));
		this._socket.on("input", this._onInput.bind(this));

		this._socket.emit("init");
	}

	private _onDisconnect() {
		if (this.currentPlayerId)
			delete this._game.state.players[this.currentPlayerId];
	}

	private _onJoin(cb: (playerId: number) => void) {
		if (!this.currentPlayer) {
			const player = createPlayer(this._game);
			this.currentPlayerId = player.id;
			cb(player.id);
		}
	}

	private _onShoot() {
		const player = this.currentPlayer;
		if (player) shoot(this._game, player);
	}

	private _onInput(moveX: number, moveY: number, aimDir: number) {
		const currentPlayer = this.currentPlayer;
		if (!currentPlayer) return;

		// Normalize move direction in order to ensure players move at a consistent speed
		// in every direction
		if (moveX != 0 || moveY != 0) {
			const moveMagnitude = Math.sqrt(moveX * moveX + moveY * moveY);
			moveX /= moveMagnitude;
			moveY /= moveMagnitude;
		}

		// Update the player's state
		currentPlayer.moveX = moveX;
		currentPlayer.moveY = moveY;
		currentPlayer.aimDir = aimDir;
	}
}
