import * as BABYLON from "babylonjs";
import GUI = BABYLON.GUI;

export class HelpMenu extends GUI.Container {
    constructor() {
        super("Help Menu");

        const text = new GUI.TextBlock("Text", "Help");
        text.color = "white";
        this.addControl(text);
    }
}
