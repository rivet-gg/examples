import { Client } from "../client/Client";
import { EntityState } from "./Entity";
import { Game, generateId } from "./Game";

export interface ExplosionState extends EntityState {
	id: number;
	positionX: number;
	positionY: number;
	destroyTimer: number;
}

export function createExplosion(
	game: Game,
	positionX: number,
	positionY: number
): ExplosionState {
	const state = {
		id: generateId(game),
		positionX: positionX,
		positionY: positionY,
		destroyTimer: 1,
	};
	game.state.explosions[state.id] = state;
	return state;
}

export function updateExplosion(game: Game, state: ExplosionState, dt: number) {
	state.destroyTimer -= dt;
	if (game.isServer && state.destroyTimer < 0) {
		delete game.state.explosions[state.id];
	}
}

export function renderExplosion(
	client: Client,
	state: ExplosionState,
	ctx: CanvasRenderingContext2D
) {
	ctx.save();

	ctx.translate(state.positionX, -state.positionY);

	const explosionWidth =
		client.assets.explosion.width * client.assets.scaleFactor;
	const explosionHeight =
		client.assets.explosion.height * client.assets.scaleFactor;
	ctx.drawImage(
		client.assets.explosion,
		-explosionWidth / 2,
		-explosionHeight / 2,
		explosionWidth,
		explosionHeight
	);

	ctx.restore();
}
