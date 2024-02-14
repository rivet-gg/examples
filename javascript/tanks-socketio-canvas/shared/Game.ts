import { BarrelState, createBarrel, updateBarrel } from "./Barrel";
import { BulletState, updateBullet } from "./Bullet";
import { ExplosionState, updateExplosion } from "./Explosion";
import { PlayerState, updatePlayer } from "./Player";
import { createTurret, TurretState, updateTurret } from "./Turret";
import { Utilities } from "./Utilities";

export interface Game {
	isServer: boolean;
	lastUpdateTimestamp: number;
	idCounter: number;

	arenaSize: number;
	viewportHeight: number;

	state: GameState;
}

export interface GameState {
	players: { [id: number]: PlayerState };
	bullets: { [id: number]: BulletState };
	barrels: { [id: number]: BarrelState };
	explosions: { [id: number]: ExplosionState };
	turrets: { [id: number]: TurretState };
}

export function createGame(isServer: boolean): Game {
	const game = {
		isServer: isServer,
		lastUpdateTimestamp: Date.now(),
		idCounter: 1,

		arenaSize: 2000,
		viewportHeight: 900,

		state: {
			players: {},
			bullets: {},
			barrels: {},
			explosions: {},
			turrets: {},
		},
	};

	// Procedurally create barrels
	if (isServer) {
		for (let i = 0; i < 16; i++) {
			const positionX = Utilities.lerp(-1000, 1000, Math.random());
			const positionY = Utilities.lerp(-1000, 1000, Math.random());
			createBarrel(game, positionX, positionY);
		}
	}

	// Procedurally create turrets
	if (isServer) {
		createTurret(game, -250, -250); // Top left
		createTurret(game, 250, -250); // Top right
		createTurret(game, 250, 250); // Bottom right
		createTurret(game, -250, 250); // Bottom left
	}

	return game;
}

export function generateId(game: Game): number {
	return game.idCounter++;
}

export function updateGame(game: Game) {
	// Determine the time since the last frame
	const now = Date.now();
	const dt = (now - game.lastUpdateTimestamp) / 1000; // Convert from milliseconds to seconds
	game.lastUpdateTimestamp = now;

	// Update all entities
	for (const playerId in game.state.players) {
		updatePlayer(game, game.state.players[playerId], dt);
	}
	for (const bulletId in game.state.bullets) {
		updateBullet(game, game.state.bullets[bulletId], dt);
	}
	for (const barrelId in game.state.barrels) {
		updateBarrel(game, game.state.barrels[barrelId], dt);
	}
	for (const explosionId in game.state.explosions) {
		updateExplosion(game, game.state.explosions[explosionId], dt);
	}
	for (const turretId in game.state.turrets) {
		updateTurret(game, game.state.turrets[turretId], dt);
	}
}
