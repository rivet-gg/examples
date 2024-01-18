import * as BABYLON from "babylonjs";
import GUI = BABYLON.GUI;
import {Utils} from "../Utils";

export class DisconnectGUI extends GUI.Rectangle {

    constructor() {
        super("Disconnect GUI");

        this.background = "rgba(0,0,0,0.75)";
        this.thickness = 0;
        this.fontFamily = Utils.fontFamily;

        const text = new GUI.TextBlock("Info", "Disconnected.");
        text.fontFamily = Utils.fontFamily;
        text.color = "white";
        text.fontSize = 40;
        text.fontStyle = "bold";
        this.addControl(text);
    }
}
