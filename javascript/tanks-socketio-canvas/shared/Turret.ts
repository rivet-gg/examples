import { Client } from "../client/Client";
import { Game, generateId } from "./Game";
import { EntityState } from "./Entity";
import { createBullet, BULLET_DAMAGE_TURRET } from "./Bullet";
import { PlayerState } from "./Player";

export interface TurretState extends EntityState {
	id: number;
	positionX: number;
	positionY: number;
	aimDir: number;
	shootTimer: number;
	aimTimer: number;
}

export const TURRET_BARREL_LENGTH = 28;

export function createTurret(
	game: Game,
	positionX: number,
	positionY: number
): TurretState {
	const state = {
		id: generateId(game),
		positionX: positionX,
		positionY: positionY,
		aimDir: 0,
		shootTimer: Math.random() * 2,
		aimTimer: Math.random() * 5,
	};
	game.state.turrets[state.id] = state;
	return state;
}

export function updateTurret(game: Game, state: TurretState, dt: number) {
	state.aimTimer += dt;
	if (state.aimTimer > 5) {
		state.aimTimer = 0;

		aimAtPlayer(game, state);
	}

	state.shootTimer += dt;
	if (state.shootTimer > 2) {
		state.shootTimer = 0;

		shoot(game, state);
	}
}

export function renderTurret(
	client: Client,
	state: TurretState,
	ctx: CanvasRenderingContext2D
) {
	ctx.save();

	ctx.translate(state.positionX, -state.positionY);

	// Draw body
	ctx.save();
	const bodyWidth =
		client.assets.turretBody.width * client.assets.scaleFactor;
	const bodyHeight =
		client.assets.turretBody.height * client.assets.scaleFactor;
	ctx.drawImage(
		client.assets.turretBody,
		-bodyWidth / 2,
		-bodyHeight / 2,
		bodyWidth,
		bodyHeight
	);
	ctx.restore();

	// Draw barrel
	ctx.save();
	ctx.rotate(state.aimDir - Math.PI / 2);
	const barrelWidth =
		client.assets.turretBarrel.width * client.assets.scaleFactor;
	const barrelHeight =
		client.assets.turretBarrel.height * client.assets.scaleFactor;
	ctx.drawImage(
		client.assets.turretBarrel,
		-barrelWidth / 2,
		-barrelHeight * 0.25,
		barrelWidth,
		barrelHeight
	);
	ctx.restore();

	ctx.restore();
}

export function shoot(game: Game, state: TurretState) {
	const dirX = Math.cos(state.aimDir);
	const dirY = Math.sin(state.aimDir);

	const bulletX = state.positionX + dirX * TURRET_BARREL_LENGTH;
	const bulletY = state.positionY + dirY * TURRET_BARREL_LENGTH;
	createBullet(
		game,
		state.id,
		BULLET_DAMAGE_TURRET,
		bulletX,
		bulletY,
		Math.atan2(-dirY, dirX)
	);
}

function aimAtPlayer(game: Game, state: TurretState) {
	// Find nearest player to turret
	let nearestPlayer: PlayerState = null;
	const nearestPlayerDist = Number.POSITIVE_INFINITY;
	for (const playerId in game.state.players) {
		const player = game.state.players[playerId];
		const dist = Math.sqrt(
			Math.pow(player.positionY - state.positionY, 2) +
				Math.pow(player.positionX - state.positionX, 2)
		);
		if (dist < nearestPlayerDist) nearestPlayer = player;
	}

	// Update the aim dir
	if (nearestPlayer != null) {
		const dirX = nearestPlayer.positionX - state.positionX;
		const dirY = nearestPlayer.positionY - state.positionY;
		state.aimDir = Math.atan2(-dirY, dirX);
	}
}
