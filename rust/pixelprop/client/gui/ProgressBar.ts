import * as BABYLON from "babylonjs";
import {float} from "../types";

export class ProgressBar extends BABYLON.GUI.Rectangle {
    private _progress: float;
    public get progress(): float { return this._progress; }
    public set progress(progress: float) {
        this._progress = progress;
        this.innerProgress.width = progress;
    }

    private innerProgress: BABYLON.GUI.Rectangle;

    public constructor(name: string, options: {
        color: string
    }) {
        super(name);

        const cornerRadius = 6;

        // Style the base
        this.background = "rgba(255,255,255,0.2)";
        this.cornerRadius = cornerRadius;
        this.thickness = 0;

        // Style the progress
        this.innerProgress = new BABYLON.GUI.Rectangle();
        this.innerProgress.height = 1;
        this.innerProgress.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.innerProgress.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.innerProgress.background = options.color;
        this.innerProgress.cornerRadius = cornerRadius;
        this.innerProgress.thickness = 0;
        this.addControl(this.innerProgress);

        this.progress = 0.5;
    }
}