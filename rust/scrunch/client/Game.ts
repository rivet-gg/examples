import PIXI = require("pixi.js");
import { Utils } from "./Utils";
import { float, int } from "./types";
import { Grid } from "./Grid";
import { Entity, EntityState } from "./entities/Entity";
import { Connection } from "./Connection";
import { EntityData, EntityInitData, EntityKind, EntityUpdateData } from "./entities/EntityData";
import { GapEntity } from "./entities/GapEntity";
import { PlayerEntity } from "./entities/PlayerEntity";
import { PointOrbEntity } from "./entities/PointOrbEntity";

export class Game extends PIXI.Application {
    static shared: Game;

    // Connection
    public connection: Connection;

    // Basics
    private previousUpdate: int = -1;
    public tileWidth = 60;
    public tileHeight = this.tileWidth * 0.7;

    // Entities
    public mapSize: int;
    public grid: Grid;
    public mainPlayerId?: int;
    public spectatingId?: int;
    public entities: { [id: number]: Entity } = { };

    public get mainPlayer(): PlayerEntity | undefined {
        if (this.mainPlayerId != undefined) {
            return this.entityForId(this.mainPlayerId) as PlayerEntity;
        } else {
            return undefined;
        }
    }
    public get spectating(): PlayerEntity | undefined {
        if (this.spectatingId != undefined) {
            return this.entityForId(this.spectatingId) as PlayerEntity;
        } else {
            return undefined;
        }
    }

    // Render properties
    public get width(): float {
        return this.renderer.width / this.renderer.resolution;
    }
    public get height(): float {
        return this.renderer.height / this.renderer.resolution;
    }
    public cameraLerpSpeed: float = 6.5;
    public cameraCenter: PIXI.Point = new PIXI.Point();

    constructor() {
        super({ // TODO: Why is the resizing screwed up?
            antialias: true,
            backgroundColor: 0xf2f2f2,
            resolution: Utils.pixelRatio
        });

        // Configure the ticker
        this.ticker.add(() => {
            // Calculate the delta time
            let dt: float;
            let now = Date.now();
            if (this.previousUpdate === -1) {
                dt = 0;
            } else {
                dt = now - this.previousUpdate
            }
            this.previousUpdate = now; // Save time for next frame
            dt /= 1000; // Convert to seconds

            // Call the function
            this.update(dt);
        });

        // Update the size
        this.updateSize();

        // Create the connection
        this.connection = new Connection();

        // Create the grid
        this.grid = new Grid();
        this.stage.addChild(this.grid);

        // Add test marker
        let marker = new PIXI.Graphics();
        marker.beginFill(0xff0000);
        marker.drawCircle(0, 0, 5);
        marker.endFill();
        this.stage.addChild(marker);

        // Add click event
        this.stage.interactive = true;
        this.stage.on("pointerdown", (ev) => {
            const clickPosition: PIXI.Point = ev.data.global;
            const indexX = this.globalToIndexX(clickPosition.x);
            const indexY = this.globalToIndexY(clickPosition.y);
            if (this.mainPlayer && this.mainPlayer.moveReady && this.mainPlayer.canMoveTo(indexX, indexY)) {
                this.connection.sendMove(indexX, indexY);
            }
        });

        // Add join event
        addEventListener("keydown", (ev) => {
            if (ev.key == "Enter") {
                this.connection.sendJoin("test username");
            }
        });
    }

    public updateSize() {
        // Calculate the size
        // let width = window.innerWidth;
        // let height = window.innerHeight;
        let width = 768;
        let height = 512;

        // Resize the renderer
        this.renderer.resize(width, height);

        // Resize the stage
        this.stage.width = width;
        this.stage.height = height;

        // Resize the view
        this.view.style.width = `${width}px`;
        this.view.style.height = `${height}px`;
    }

    public begin() {
        // Update the size // TODO: Figure out why I can't just call `this.updateSize()` without timer
        setTimeout(() => this.updateSize(), 0);

        // Start the application
        this.start();
    }

    public update(dt: float) {
        // Update the entities
        for (let id in this.entities) {
            this.entities[id].update(dt);
        }

        // Remove entities
        for (let id in this.entities) {
            let entity = this.entityForId(id);

            // Remove the entity if needed
            if (entity.state == EntityState.PendingDestroy) {
                this.stage.removeChild(entity);
                entity.state = EntityState.Destroyed;
                delete this.entities[id];
            }
        }

        // Update the entities
        for (let id in this.entities) {
            let entity = this.entityForId(id);
            entity.update(dt);
        }

        // Move the camera
        let spectatingEntity = this.spectating;
        if (spectatingEntity) {
            this.cameraCenter.x = Math.lerp(this.cameraCenter.x, spectatingEntity.position.x, dt * this.cameraLerpSpeed);
            this.cameraCenter.y = Math.lerp(this.cameraCenter.y, spectatingEntity.position.y, dt * this.cameraLerpSpeed);
        }
        this.stage.pivot.copy(this.cameraCenter);
        this.stage.position.x = this.width / 2;
        this.stage.position.y = this.height / 2;

        // Update the grid
        this.grid.update(dt);

        // Sort the children
        this.sortChildren();
    }

    public sortChildren() {
        this.stage.children.sort((a, b) => {
            // If not an entity, push to the back
            if ((a as Entity).kind == undefined) return -1;
            if ((b as Entity).kind == undefined) return 1;

            // Compare the y values
            a = a as Entity;
            b = b as Entity;
            if (a.position.y > b.position.y) return 1;
            if (a.position.y < a.position.y) return -1;

            return 0;
        });
    }

    /* Entity management */
    public addEntity(data: EntityInitData) {
        console.log("Add entity", data);

        // Make sure an entity doesn't already exist
        if (this.entities[data.id]) {
            console.error(`Entity with id ${data.id} already exists.`);
            return;
        }

        // Create the entity
        let entity: Entity;
        switch (data.kind) {
            case EntityKind.Player:
                entity = new PlayerEntity();
                break;
            case EntityKind.Gap:
                entity = new GapEntity();
                break;
            case EntityKind.PointOrb:
                entity = new PointOrbEntity();
                break;
            default:
                console.error(`Unknown entity kind ${(data as any).kind}.`)
        }
        entity.initEntity(data);

        // Add to the map
        this.entities[data.id] = entity;
        this.stage.addChild(entity);
    }

    public updateEntity(data: EntityUpdateData) {
        console.log("Update entity", data);

        // Update the entity
        this.entityForId(data.id).updateEntity(data);
    }

    public removeEntity(id: int, animated: boolean) {
        console.log("Remove entity", id, animated);

        // Destroy the entity
        let entity = this.entityForId(id);
        entity.destroyEntity(animated);

        // Remove spectating or main player if needed
        if (id == this.mainPlayerId) {
            this.mainPlayerId = undefined;
        }
        if (id == this.spectatingId) {
            this.spectatingId = undefined;
        }
    }

    public entityForId(id: int | string): Entity | undefined {
        let entity = this.entities[id];
        if (entity) {
            return entity;
        } else {
            console.warn(`No entity with id ${id}.`);
            return undefined;
        }
    }

    public entityAtIndex(x: int, y: int): Entity | undefined {
        for (let id in this.entities) {
            let entity = this.entityForId(id);
            if (entity.entityX === x && entity.entityY === y) {
                return entity;
            }
        }
        return undefined;
    }

    /* Utils */
    public indexToGlobalX(indexX: int): float {
        return indexX * this.tileWidth;
    }

    public indexToGlobalY(indexY: int): float {
        return indexY * this.tileHeight;
    }

    public globalToIndexX(globalX: float): int {
        return this.grid.indexForX(this.globalToLocalX(globalX));
    }

    public globalToIndexY(globalY: float): int {
        return this.grid.indexForY(this.globalToLocalY(globalY));
    }

    public globalToLocalX(xPos: float): float {
        return xPos + (this.cameraCenter.x - this.width / 2);
    }

    public globalToLocalY(yPos: float): float {
        return yPos + (this.cameraCenter.y - this.height / 2);
    }
}
