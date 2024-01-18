import { Entity } from "./Entity";

export class GapEntity extends Entity {
    // Components
    private bodyGraphics: PIXI.Graphics = new PIXI.Graphics(); // Origin is at the center of the bottom square

    public constructor() {
        super();

        // Automatically position it
        this.autoPosition = true;

        // Draw the graphics
        this.bodyGraphics.beginFill(0x0000ff);
        this.bodyGraphics.drawRect(-7.5, -7.5, 15, 15);
        this.bodyGraphics.endFill();

        // Insert the body graphics
        this.addChild(this.bodyGraphics);
    }
}
