import * as BABYLON from "babylonjs";
import GUI = BABYLON.GUI;
import {Utils} from "../Utils";

export class PointerLockGUI extends GUI.Rectangle {

    constructor() {
        super("Pointer Lock GUI");

        this.background = "rgba(0,0,0,0.75)";
        this.thickness = 0;
        this.fontFamily = Utils.fontFamily;

        const text = new GUI.TextBlock("Info", "Click to lock pointer.");
        text.fontFamily = Utils.fontFamily;
        text.color = "white";
        text.fontSize = 40;
        text.fontStyle = "bold";
        this.addControl(text);
    }
}
