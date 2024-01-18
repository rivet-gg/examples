import PIXI = require("pixi.js");
import { int, float } from "./types";
import { Game } from "./Game";
import { EntityKind } from "./entities/EntityData";
import { PlayerEntity } from "./entities/PlayerEntity";

export class Grid extends PIXI.Container { // TODO: Render shapes to a texture
    // Components
    private baseGrid: PIXI.Graphics = new PIXI.Graphics();

    public constructor() {
        super();

        this.addChild(this.baseGrid);
    }

    public update(dt: float) {
        this.drawGrid();
    }

    public drawGrid() {
        const mapSize = Game.shared.mapSize;
        const mainPlayer = Game.shared.mainPlayer;

        // Get the frame positions
        const tileWidth = Game.shared.tileWidth;
        const tileHeight = Game.shared.tileHeight;
        const stageWidth = Game.shared.width;
        const stageHeight = Game.shared.height;
        const startX = Game.shared.cameraCenter.x - stageWidth / 2;
        const endX = Game.shared.cameraCenter.x + stageWidth / 2;
        const startY = Game.shared.cameraCenter.y - stageHeight / 2;
        const endY = Game.shared.cameraCenter.y + stageHeight / 2;

        // Find the index at which the mouse is
        const mousePosition: PIXI.Point = Game.shared.renderer.plugins.interaction.mouse.global;
        const hoverIndexX = Game.shared.globalToIndexX(mousePosition.x);
        const hoverIndexY = Game.shared.globalToIndexY(mousePosition.y);
        const showMovementGrid = mainPlayer; // && !mainPlayer.animating;
        const showsHover = showMovementGrid && mainPlayer.canMoveTo(hoverIndexX, hoverIndexY);
        Game.shared.view.style.cursor = showsHover ? "pointer" : "default";

        // Draw a tile for every possible position
        const tilePadding = 2;
        this.baseGrid.clear();
        for (let x = Math.floor(startX / tileWidth); x < Math.ceil(endX / tileWidth) + 1; x++) {
            for (let y = Math.floor(startY / tileHeight); y < Math.ceil(endY / tileHeight) + 1; y++) {
                // Don't render if there's a gap there
                // let entity = Game.shared.entityAtIndex(x, y);
                // if (entity && entity.kind == EntityKind.Gap) {
                //     continue;
                // }

                // Determine if another player can move here so it's highlighted
                let otherPlayerCanMoveHere = false;
                for (let id in Game.shared.entities) {
                    const entity = Game.shared.entities[id] as PlayerEntity;
                    if (entity.kind == EntityKind.Player && entity.canMoveTo(x, y, false)) {
                        otherPlayerCanMoveHere = true;
                        break;
                    }
                }

                // Don't render if outside of map
                if (Math.abs(x) > mapSize || Math.abs(y) > mapSize) {
                    continue;
                }

                // Determine if hovering
                let color: int;
                if (showsHover && x === hoverIndexX && y === hoverIndexY) {
                    color = 0xff0000;
                } else if (showMovementGrid && mainPlayer && mainPlayer.canMoveTo(x, y)) {
                    color = 0x00ff00;
                } else if (otherPlayerCanMoveHere) {
                    color = 0xd1d1d1;
                } else {
                    color = 0xe5e5e5;
                }

                // Set the appropriate fill
                this.baseGrid.beginFill(color);

                // Draw the grid tile
                this.baseGrid.drawRect(
                    x * tileWidth + tilePadding - tileWidth / 2, y * tileHeight + tilePadding - tileHeight / 2, 
                    tileWidth - tilePadding * 2, tileHeight - tilePadding * 2
                );

                // End the fill
                this.baseGrid.endFill();
            }
        }
    }

    public indexForX(xPos: float): int {
        return Math.round(xPos / Game.shared.tileWidth);
    }

    public indexForY(yPos: float): int {
        return Math.round(yPos / Game.shared.tileHeight);
    }
}