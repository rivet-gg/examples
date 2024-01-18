import { Entity } from "./Entity";
import { int } from "../types";
import { EntityInitData, EntityUpdateData, PointOrbInitData, PointOrbUpdateData } from "./EntityData";

export class PointOrbEntity extends Entity {
    // Components
    private bodyGraphics: PIXI.Graphics = new PIXI.Graphics(); // Origin is at the center of the bottom square
    private bodyText: PIXI.Text = new PIXI.Text("0");

    // State
    private _points: int = 0;
    public get points(): int { return this._points; }
    public set points(points: int) {
        this._points = points;
        this.bodyText.text = points.toString();
    }

    public constructor() {
        super();

        // Automatically position it
        this.autoPosition = true;

        // Draw the graphics
        this.bodyGraphics.beginFill(0xffff00);
        this.bodyGraphics.drawCircle(0, 0, 20);
        this.bodyGraphics.endFill();

        // Insert the body graphics
        this.addChild(this.bodyGraphics);
        this.addChild(this.bodyText);
    }


    public initEntity(data: EntityInitData) {
        super.initEntity(data);
        this.applyUpdate(data.data as PointOrbUpdateData);
    }

    public updateEntity(data: EntityUpdateData) {
        super.updateEntity(data);
        if (data.data != undefined) {
            this.applyUpdate(data.data as PointOrbUpdateData);
        }
    }

    private applyUpdate(data: PointOrbUpdateData) {
        this.points = data[0];
    }
}
