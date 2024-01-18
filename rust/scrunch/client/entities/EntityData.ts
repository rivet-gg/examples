import {int} from "../types";

/* Entity kinds */
export enum EntityKind {
    Player = 0,
    Gap = 1,
    PointOrb = 2
}

/* Map data */
export type EntityId = int;
export type MapIndex = [int, int];

/* Base entity */
export interface EntityData {
    id: EntityId
}

export interface EntityInitData extends EntityData {
    kind: EntityKind,
    index: MapIndex,
    data: PlayerInitData | GapInitData | PointOrbInitData
}

export interface EntityUpdateData extends EntityData {
    index?: MapIndex,
    data: GapUpdateData | PlayerUpdateData | PointOrbUpdateData | undefined // This may be undefined if only index updated
}

/* Gap */
export type GapInitData = undefined;
export type GapUpdateData = undefined;

/* Player */
export interface PlayerInitData{
    username: string,
    points: int;
    class: PlayerClass
}

export interface PlayerUpdateData {
    points?: int;
}

export interface PlayerClass {
    color: int,
    moveWait: int, // In milliseconds
    movePositions: MapIndex[]
}

/* Points */
export type PointOrbInitData = [int];
export type PointOrbUpdateData = PointOrbInitData;
