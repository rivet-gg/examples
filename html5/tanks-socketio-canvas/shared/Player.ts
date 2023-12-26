import { Client } from "../client/Client";
import { Game, generateId } from "./Game";
import { Utilities } from "./Utilities";
import { EntityState } from "./Entity";
import { createBullet, BULLET_DAMAGE_PLAYER } from "./Bullet";

export interface PlayerState extends EntityState {
	id: number;
	positionX: number;
	positionY: number;
	aimDir: number;
	moveX: number;
	moveY: number;
	health: number;
	score: number;
	shootTimer: number;
}

export const PLAYER_MOVE_SPEED = 500;
export const PLAYER_RADIUS = 38;
export const BARREL_LENGTH = 45;
export const RELOAD_TIME = 0.5;

export function createPlayer(game: Game): PlayerState {
	const state = {
		id: generateId(game),
		positionX: Utilities.lerp(
			-game.arenaSize / 2,
			game.arenaSize / 2,
			Math.random()
		),
		positionY: Utilities.lerp(
			-game.arenaSize / 2,
			game.arenaSize / 2,
			Math.random()
		),
		aimDir: 0,
		moveX: 0,
		moveY: 0,
		health: 1,
		score: 0,
		shootTimer: 0,
	};
	game.state.players[state.id] = state;
	return state;
}

export function updatePlayer(game: Game, state: PlayerState, dt: number) {
	// Move the player based on the move input
	state.positionX += state.moveX * PLAYER_MOVE_SPEED * dt;
	state.positionY += state.moveY * PLAYER_MOVE_SPEED * dt;

	// Restrain to bounds
	state.positionX = Math.max(
		state.positionX,
		-game.arenaSize / 2 + PLAYER_RADIUS
	);
	state.positionX = Math.min(
		state.positionX,
		game.arenaSize / 2 - PLAYER_RADIUS
	);
	state.positionY = Math.max(
		state.positionY,
		-game.arenaSize / 2 + PLAYER_RADIUS
	);
	state.positionY = Math.min(
		state.positionY,
		game.arenaSize / 2 - PLAYER_RADIUS
	);

	state.shootTimer -= dt;
}

export function renderPlayer(
	client: Client,
	state: PlayerState,
	ctx: CanvasRenderingContext2D
) {
	ctx.save();

	ctx.translate(state.positionX, -state.positionY);

	// Draw body
	ctx.save();
	ctx.rotate(Math.atan2(-state.moveY, state.moveX) + Math.PI / 2);
	const bodyWidth =
		client.assets.tankBodyRed.width * client.assets.scaleFactor;
	const bodyHeight =
		client.assets.tankBodyRed.height * client.assets.scaleFactor;
	ctx.drawImage(
		client.assets.tankBodyRed,
		-bodyWidth / 2,
		-bodyHeight / 2,
		bodyWidth,
		bodyHeight
	);
	ctx.restore();

	// Draw barrel
	ctx.save();
	ctx.rotate(state.aimDir + Math.PI / 2);
	const barrelWidth =
		client.assets.tankBarrelRed.width * client.assets.scaleFactor;
	const barrelHeight =
		client.assets.tankBarrelRed.height * client.assets.scaleFactor;
	ctx.drawImage(
		client.assets.tankBarrelRed,
		-barrelWidth / 2,
		-barrelHeight * 0.75,
		barrelWidth,
		barrelHeight
	);
	ctx.restore();

	// Draw health
	const healthY = -PLAYER_RADIUS - 5;
	const healthWidth = 80;
	const healthHeight = 10;
	const healthPadding = 4;
	ctx.save();
	ctx.fillStyle = "#333";
	ctx.fillRect(
		-healthWidth / 2 - healthPadding,
		healthY - healthHeight / 2 - healthPadding,
		healthWidth + healthPadding * 2,
		healthHeight + healthPadding * 2
	);
	ctx.fillStyle = "white";
	ctx.fillRect(
		-healthWidth / 2,
		healthY - healthHeight / 2,
		healthWidth * state.health,
		healthHeight
	);
	ctx.restore();

	// Draw score
	const scoreY = healthY - 25;
	ctx.save();
	ctx.fillStyle = "white";
	ctx.strokeStyle = "#333";
	ctx.lineWidth = 6;
	ctx.font = Utilities.font(32, 700);
	ctx.strokeText(state.score.toString(), 0, scoreY);
	ctx.fillText(state.score.toString(), 0, scoreY);
	ctx.restore();

	ctx.restore();
}

export function shoot(game: Game, state: PlayerState) {
	if (state.shootTimer < 0) {
		state.shootTimer = RELOAD_TIME;

		const dirX = Math.cos(state.aimDir);
		const dirY = -Math.sin(state.aimDir);

		const bulletX = state.positionX + dirX * BARREL_LENGTH;
		const bulletY = state.positionY + dirY * BARREL_LENGTH;
		createBullet(
			game,
			BULLET_DAMAGE_PLAYER,
			state.id,
			bulletX,
			bulletY,
			Math.atan2(dirY, dirX)
		);
	}
}

export function damagePlayer(
	game: Game,
	state: PlayerState,
	amount: number,
	damagerId?: number
) {
	state.health -= amount;
	if (state.health <= 0) {
		onPlayerKill(game, state, damagerId);
	}
}

function onPlayerKill(game: Game, state: PlayerState, killerId?: number) {
	// Give points to the killer
	if (killerId) {
		const killer = game.state.players[killerId];
		if (killer) {
			killer.score += 1;
		}
	}

	// Remove this player
	delete game.state.players[state.id];
}
