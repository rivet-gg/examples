import { Input } from "./Input";
import { createGame, Game, updateGame } from "../shared/Game";
import { Assets } from "./Assets";
import { PlayerState, renderPlayer } from "../shared/Player";
import { Connection } from "./Connection";
import { Utilities } from "../shared/Utilities";
import { renderBullet } from "../shared/Bullet";
import { renderBarrel } from "../shared/Barrel";
import { renderExplosion } from "../shared/Explosion";
import { renderTurret } from "../shared/Turret";

import { RivetClient } from "@rivet-gg/api";
export const RIVET = new RivetClient({ token: process.env.RIVET_TOKEN });

const TITLE_TEXT = "Tanks!";

export interface Client {
	canvas: HTMLCanvasElement;

	input: Input;
	assets: Assets;

	game: Game;
	currentPlayerId?: number;

	connection?: Connection;

	screenWidth: number;
	screenHeight: number;
	cameraOffsetX: number;
	cameraOffsetY: number;
}

export async function createClient(): Promise<Client> {
	const client = {
		canvas: document.getElementById("game") as HTMLCanvasElement,

		input: new Input(),
		assets: new Assets(),

		game: createGame(false),
		currentPlayerId: undefined,

		connection: undefined,

		screenWidth: 0,
		screenHeight: 0,
		cameraOffsetX: 0,
		cameraOffsetY: 0,
	};

	// Handle resizing
	window.addEventListener("resize", resize.bind(null, client));
	resize(client);

	// Setup input
	client.input.onKeyDown("enter", joinGame.bind(null, client));
	client.input.onKeyDown(" ", shoot.bind(null, client));

	// Setup game
	update(client);

	try {
		connect(client);
	} catch (err) {
		console.error("Failed to connect:", err);
	}

	return client;
}

async function connect(client: Client) {
	const res = await RIVET.matchmaker.lobbies.find({ gameModes: ["default"] });
	const port = res.ports["default"];
	client.connection = new Connection(client, port.isTls, port.host, {
		token: res.player.token,
	});
}

export function getCurrentPlayer(client: Client): PlayerState | undefined {
	if (client.currentPlayerId) {
		return client.game.state.players[client.currentPlayerId];
	} else {
		return undefined;
	}
}

function resize(client: Client) {
	client.canvas.width = window.innerWidth;
	client.canvas.height = window.innerHeight;
}

function joinGame(client: Client) {
	client.connection?.socket.emit("join", (playerId: number) => {
		client.currentPlayerId = playerId;
	});
}

function shoot(client: Client) {
	client.connection?.socket.emit("shoot");
}

function update(client: Client) {
	// Update the current player's state
	const currentPlayer = getCurrentPlayer(client);
	if (currentPlayer) {
		// Determine move direction
		let moveX = 0;
		let moveY = 0;
		if (client.input.isKeyDown("a")) moveX -= 1;
		if (client.input.isKeyDown("d")) moveX += 1;
		if (client.input.isKeyDown("s")) moveY -= 1;
		if (client.input.isKeyDown("w")) moveY += 1;

		// Determine rotation
		const aimDir = Math.atan2(
			client.input.mousePosition.y - client.canvas.clientHeight / 2,
			client.input.mousePosition.x - client.canvas.clientWidth / 2,
		);

		client.connection?.socket.emit("input", moveX, moveY, aimDir);
	}

	// Update the game
	updateGame(client.game);

	// Render the game
	const ctx = client.canvas.getContext("2d");
	if (!ctx) {
		alert("Failed to get context");
		return;
	}
	render(client, ctx);

	// Ask the browser to call client.update function again on the next frame.
	requestAnimationFrame(update.bind(null, client));
}

function render(client: Client, ctx: CanvasRenderingContext2D) {
	const currentPlayer = getCurrentPlayer(client);

	// Update world screen width and height
	const scale = window.innerHeight / client.game.viewportHeight;
	client.screenWidth = window.innerWidth / scale;
	client.screenHeight = window.innerHeight / scale;

	ctx.save();

	// Set default styles
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.font = Utilities.font(36);

	// Clear any graphics left on the canvas from the last frame
	ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

	// Center <0, 0> to the center of the screen and scale to have an equal height on all devices
	ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
	ctx.scale(scale, scale);

	// Center on the player (if needed)
	if (currentPlayer !== undefined) {
		client.cameraOffsetX = currentPlayer.positionX;
		client.cameraOffsetY = -currentPlayer.positionY;
	} else {
		client.cameraOffsetX = 0;
		client.cameraOffsetY = 0;
	}

	// Render the world
	ctx.save();
	ctx.translate(-client.cameraOffsetX, -client.cameraOffsetY);
	renderBackground(client, ctx);
	renderGame(client, ctx);
	renderWall(client, ctx);
	ctx.restore();

	// Render menu in front of game
	renderMenu(client, ctx);

	ctx.restore();
}

function renderBackground(client: Client, ctx: CanvasRenderingContext2D) {
	if (client.assets.tileSand.complete) {
		const tileSize =
			client.assets.tileSand.height * client.assets.scaleFactor;
		const tileXMin = Math.floor(
			(client.cameraOffsetX - client.screenWidth / 2) / tileSize,
		);
		const tileXMax = Math.ceil(
			(client.cameraOffsetX + client.screenWidth / 2) / tileSize,
		);
		const tileYMin = Math.floor(
			(client.cameraOffsetY - client.game.viewportHeight / 2) / tileSize,
		);
		const tileYMax = Math.ceil(
			(client.cameraOffsetY + client.game.viewportHeight / 2) / tileSize,
		);
		for (let x = tileXMin; x <= tileXMax; x++) {
			for (let y = tileYMin; y <= tileYMax; y++) {
				ctx.drawImage(
					client.assets.tileSand,
					x * tileSize,
					y * tileSize,
					tileSize,
					tileSize,
				);
			}
		}
	}
}

function renderWall(client: Client, ctx: CanvasRenderingContext2D) {
	if (client.assets.wall.complete) {
		const wallSize = client.assets.wall.width * client.assets.scaleFactor;
		const paddedArenaSize = client.game.arenaSize + wallSize; // Account for border image width along the outline
		const idealSpacing = 60;
		const wallCount = Math.floor(paddedArenaSize / idealSpacing);
		for (let i = 0; i < wallCount; i++) {
			const progress =
				-paddedArenaSize / 2 + (i / (wallCount - 1)) * paddedArenaSize;

			// Top
			ctx.drawImage(
				client.assets.wall,
				progress - wallSize / 2,
				-paddedArenaSize / 2 - wallSize / 2,
				wallSize,
				wallSize,
			);
			// Bottom
			ctx.drawImage(
				client.assets.wall,
				progress - wallSize / 2,
				paddedArenaSize / 2 - wallSize / 2,
				wallSize,
				wallSize,
			);
			// Left
			ctx.drawImage(
				client.assets.wall,
				-paddedArenaSize / 2 - wallSize / 2,
				progress - wallSize / 2,
				wallSize,
				wallSize,
			);
			// Right
			ctx.drawImage(
				client.assets.wall,
				paddedArenaSize / 2 - wallSize / 2,
				progress - wallSize / 2,
				wallSize,
				wallSize,
			);
		}
	}
}

function renderMenu(client: Client, ctx: CanvasRenderingContext2D) {
	if (client.connection?.isDisconnected) {
		renderFullscreenMessage(client, ctx, "Disconnected.");
	} else if (!client.connection?.isConnected) {
		renderFullscreenMessage(client, ctx, "Connecting...");
	} else if (!client.connection?.isInitiated) {
		renderFullscreenMessage(client, ctx, "Initiating...");
	} else if (!getCurrentPlayer(client)) {
		renderFullscreenMessage(client, ctx, "Press Enter to join");

		// Render title
		ctx.save();
		ctx.fillStyle = "white";
		ctx.strokeStyle = "#333";
		ctx.lineWidth = 30;
		ctx.font = Utilities.font(175, 900);
		const titleY = -client.screenHeight / 2 + 150;
		ctx.strokeText(TITLE_TEXT, 0, titleY);
		ctx.fillText(TITLE_TEXT, 0, titleY);
		ctx.restore();

		// Render instructions
		ctx.save();
		ctx.fillStyle = "white";
		const instructions = [
			"Controls:",
			"Aim: Mouse",
			"Move: WASD",
			"Fire: Space",
		];
		ctx.textAlign = "left";
		ctx.textBaseline = "bottom";
		for (let i = 0; i < instructions.length; i++) {
			ctx.fillText(
				instructions[i],
				-client.screenWidth / 2 + 20,
				client.screenHeight / 2 -
					20 -
					(instructions.length - i - 1) * 50,
			);
		}
		ctx.restore();
	}
}

function renderFullscreenMessage(
	client: Client,
	ctx: CanvasRenderingContext2D,
	message: string,
) {
	ctx.save();
	ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
	ctx.fillRect(
		-client.screenWidth / 2,
		-client.screenHeight / 2,
		client.screenWidth,
		client.screenHeight,
	);
	ctx.restore();

	ctx.save();
	ctx.fillStyle = "white";
	ctx.fillText(message, 0, 0);
	ctx.restore();
}

function renderGame(client: Client, ctx: CanvasRenderingContext2D) {
	for (const playerId in client.game.state.players) {
		renderPlayer(client, client.game.state.players[playerId], ctx);
	}
	for (const bulletId in client.game.state.bullets) {
		renderBullet(client, client.game.state.bullets[bulletId], ctx);
	}
	for (const barrelId in client.game.state.barrels) {
		renderBarrel(client, client.game.state.barrels[barrelId], ctx);
	}
	for (const explosionId in client.game.state.explosions) {
		renderExplosion(client, client.game.state.explosions[explosionId], ctx);
	}
	for (const turretId in client.game.state.turrets) {
		renderTurret(client, client.game.state.turrets[turretId], ctx);
	}
}
