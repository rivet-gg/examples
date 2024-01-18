import * as BABYLON from "babylonjs";
import GUI = BABYLON.GUI;
import {Game} from "../../Game";
import {Storage} from "../../Storage";
import {Utils} from "../../Utils";

export class CustomizeMenu extends GUI.Container {
    constructor() {
        super("Customize Menu");

        const storeData = Game.shared.storeData;

        this.fontFamily = Utils.fontFamily;

        const panel = new BABYLON.GUI.StackPanel();
        this.addControl(panel);

        const textblock = new BABYLON.GUI.TextBlock("Character Header", "Character");
        textblock.color = "white";
        textblock.height = "50px";
        panel.addControl(textblock);

        for (let character of storeData.characters) {
            const button = new BABYLON.GUI.RadioButton();
            button.checkSizeRatio = 0.6;
            button.width = "20px";
            button.height = "20px";
            button.color = "white";
            button.background = "rgba(255,255,255,0.1)";
            button.thickness = 0;

            // Set if checked; do this later so it's done after all the buttons are initialized
            setTimeout(() => button.isChecked = character.id == Storage.characterId, 0);

            button.onIsCheckedChangedObservable.add((state) => {
                if (state)
                    Storage.characterId = character.id;
            });

            const header = BABYLON.GUI.Control.AddHeader(button, character.name, "200px", { isHorizontal: true, controlFirst: true });
            header.color = "white";
            header.height = "30px";

            panel.addControl(header);
        }
    }
}
