import { float, int } from "../types";
import { Entity, EntityState } from "./Entity";
import { EntityInitData, EntityUpdateData, PlayerClass, PlayerInitData, PlayerUpdateData } from "./EntityData";
import { Game } from "../Game";
import Color = require("color");

export class PlayerEntity extends Entity {
    // Components
    private bodyGraphics: PIXI.Graphics = new PIXI.Graphics(); // Origin is at the center of the bottom square
    private usernameText: PIXI.Text = new PIXI.Text("unknown", {
        align: "center"
    });

    // Player properties
    public username: string;
    public points: int;
    public playerClass: PlayerClass;

    // Movement management
    private moveTime: int = 0;
    public get moveReady(): boolean {
        return this.moveTime + this.playerClass.moveWait < Date.now();
    }

    // Colors
    private bodyColor: int;
    private topColor: int;

    // Measurements
    private get playerHeight(): float {
        let height = this.points * 3; // Point height
        height += Math.sin(this.timeAlive * 1.7) * 2 + 15; // Small breathing
        if (this.moveAnimationTime != undefined) { // Jump animation
            const phaseCount = 1.7;
            // const phase = Math.sin(4 * this.moveAnimationTime * Math.PI / 2 - Math.PI / 2) / 2 + 0.5;
            const phase = Math.sin(phaseCount * 4 * this.moveAnimationTime * Math.PI / 2) * (1 - this.moveAnimationTime);
            height += phase * 15;
        }
        height *= this.growShrinkValue; // Grow/shrink animation for spawning or destroying
        return height;
    }
    private get topWidth(): float {
        return Game.shared.tileWidth - 12;
    }
    private get topHeight(): float {
        return Game.shared.tileHeight - 12;
    }

    // Enter/exit animation
    private growShrinkTime: float = 0.6; // Time it takes to grow or shrink
    private growShrinkValue: float = 0; // Used to shrink on death and spawn

    // Move animation
    private moveAnimationTime?: float = undefined; // 0 to 1
    private moveAnimationLength: float = 0.55; // Number of seconds // TODO: Adjust slightly based on how fast the player moves
    private startX: int = 0;
    private startY: int = 0;

    public get animating(): boolean {
        return this.moveAnimationTime != undefined;
    }

    // Misc
    private timeAlive: float = 0;

    public constructor() {
        super();

        // Add components
        this.addChild(this.bodyGraphics);
        this.addChild(this.usernameText);
    }

    public initEntity(data: EntityInitData) {
        super.initEntity(data);

        // Update player data
        let playerData = data.data as PlayerInitData;
        this.username = playerData.username;
        this.points = playerData.points;
        this.playerClass = playerData.class;

        // Set the colors
        this.bodyColor = this.playerClass.color;
        this.topColor = new Color(this.bodyColor).lighten(0.16).rgbNumber();

        // Update the username
        this.usernameText.text = this.username;
        this.usernameText.position.set(-this.usernameText.width / 2, -this.usernameText.height / 2 + 40);
    }

    public updateEntity(data: EntityUpdateData) {
        super.updateEntity(data);

        // Update move time
        if (data.index != undefined)
            this.moveTime = Date.now();

        // Handle player data
        let playerData = data.data as PlayerUpdateData;
        if (playerData == undefined)
            return;
        if (playerData.points != undefined) {
            this.points = playerData.points;
        }
    }

    public animateDestroy(): any {
        // Do nothing an let the destroy take its course
    }

    public update(dt: float) {
        super.update(dt);

        // Add to time alive
        this.timeAlive += dt;

        // Update the grow/shrink
        if (this.state == EntityState.DestroyingAnimated) {
            this.growShrinkValue = Math.max(this.growShrinkValue - dt / this.growShrinkTime, 0);
            if (this.growShrinkValue <= 0) {
                this.destroyEntity(false);
            }
        } else {
            this.growShrinkValue = Math.min(this.growShrinkValue + dt / this.growShrinkTime, 1);
        }
        this.alpha = Math.min(this.growShrinkValue * 2, 1); // Make sure fully opaque at 0.5

        // Re-render shape
        this.updateShape();

        // Do the animation if needed
        if (this.moveAnimationTime != undefined) {
            // Increase the time
            this.moveAnimationTime += dt / this.moveAnimationLength;

            // Determine the values
            const startX = Game.shared.indexToGlobalX(this.startX);
            const startY = Game.shared.indexToGlobalY(this.startY);
            const targetX = Game.shared.indexToGlobalX(this.entityX);
            const targetY = Game.shared.indexToGlobalY(this.entityY);

            // If animation is finished, stop animating
            if (this.moveAnimationTime >= 1) {
                this.moveAnimationTime = undefined;
            }

            // Update position
            this.position.set(this.positionX(), this.positionY(true));
        }
    }

    private positionX(): float {
        const startX = Game.shared.indexToGlobalX(this.startX);
        const targetX = Game.shared.indexToGlobalX(this.entityX);

        if (this.moveAnimationTime == undefined || this.moveAnimationTime >= 1) {
            return targetX;
        } else {
            return Math.lerp(startX, targetX, this.moveAnimationTime);
        }
    }

    private positionY(useCurve: boolean): float {
        const startY = Game.shared.indexToGlobalY(this.startY);
        const targetY = Game.shared.indexToGlobalY(this.entityY);

        if (this.moveAnimationTime == undefined || this.moveAnimationTime >= 1) {
            return targetY;
        } else {
            return Math.lerp(startY, targetY, this.moveAnimationTime) - (useCurve ? this.positionYCurve() : 0);
        }
    }

    private positionYCurve(): float {
        const time = this.moveAnimationTime == undefined ? 1 : this.moveAnimationTime;
        return Math.sin(time * Math.PI) * 50;
    }

    public updateShape() {
        const height = this.playerHeight;
        const topWidth = this.topWidth;
        const topHeight = this.topHeight;
        const borderRadius = 8;

        this.bodyGraphics.clear();

        // Draw the shadow
        const shadowPadding = 2;
        const shadowYOffset = this.positionYCurve();
        const shadowYScale = 1 / (shadowYOffset / 100 + 1);
        this.bodyGraphics.beginFill(0x000000, 0.2);
        this.bodyGraphics.drawRoundedRect(
            (-topWidth / 2 - shadowPadding) * shadowYScale, (-topHeight / 2 - shadowPadding) * shadowYScale + shadowYOffset,
            (topWidth + shadowPadding * 2) * shadowYScale, (topHeight + shadowPadding * 2) * shadowYScale, borderRadius
        );
        this.bodyGraphics.endFill();

        // Draw the body
        this.bodyGraphics.beginFill(this.playerClass.color, 0.95);
        this.bodyGraphics.drawRoundedRect(-topWidth / 2, -height - topHeight / 2, topWidth, topHeight + height, borderRadius);
        this.bodyGraphics.endFill();

        // Draw the top
        this.bodyGraphics.beginFill(this.topColor, 0.8);
        this.bodyGraphics.drawRoundedRect(-topWidth / 2, -topHeight / 2 - height, topWidth, topHeight, borderRadius);
        this.bodyGraphics.endFill();

        // Draw the eyes
        const eyeDistance: float = 10;
        const eyeHeight: float = -height + topHeight / 2 + 10;
        this.drawEye(eyeDistance, eyeHeight);
        this.drawEye(-eyeDistance, eyeHeight);

        // Draw the mouth
        const mouthHeight = eyeHeight + 7;
        const surprised = this.timeAlive % 6 > 4;
        this.bodyGraphics.beginFill(0x000000, 0.3);
        if (surprised) {
            this.bodyGraphics.drawCircle(0, mouthHeight, 3);
        } else {
            const mouthWidth = 10;
            this.bodyGraphics.drawRect(-mouthWidth / 2, mouthHeight, mouthWidth, 2);
        }
        this.bodyGraphics.endFill();
    }

    private drawEye(x: float, y: float) {
        const eyeWidth = 4;
        const isBlinking = this.timeAlive % 5 > 4.75;
        if (isBlinking) {
            // Eyelid
            this.bodyGraphics.beginFill(0x000000, 0.3);
            this.bodyGraphics.drawRect(x - eyeWidth / 2, y - 1, eyeWidth, 2);
            this.bodyGraphics.endFill();
        } else {
            // Outline
            this.bodyGraphics.beginFill(0xffffff);
            this.bodyGraphics.drawCircle(x, y, eyeWidth);
            this.bodyGraphics.endFill();

            // Pupil
            this.bodyGraphics.beginFill(0x000000);
            this.bodyGraphics.drawCircle(x, y, 2);
            this.bodyGraphics.endFill();
        }
    }

    public moveTo(x: int, y: int) {
        // Start the animation
        this.moveAnimationTime = 0;
        this.startX = this.entityX;
        this.startY = this.entityY;

        // Update the index
        super.moveTo(x, y);
    }

    /// Determine if the position can be moved to
    public canMoveTo(x: int, y: int, checkTiming: boolean = true): boolean {
        return this.canMoveToRelative(x - this.entityX, y - this.entityY, checkTiming);
    }

    /// Determines if the relative position is in the possible move pattern
    public canMoveToRelative(x: int, y: int, checkTiming: boolean = true): boolean {
        for (let position of this.playerClass.movePositions) {
            if (position[0] === x && position[1] === y) {
                if (checkTiming) {
                    return this.moveReady;
                } else {
                    return true;
                }
            }
        }
        return false;
    }
}
