import * as BABYLON from "babylonjs";
import GUI = BABYLON.GUI;

export class ShopMenu extends GUI.Container {
    constructor() {
        super("Shop Menu");

        const text = new GUI.TextBlock("Text", "Shop");
        text.color = "white";
        this.addControl(text);
    }
}
