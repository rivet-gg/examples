import * as BABYLON from "babylonjs";
import GUI = BABYLON.GUI;
import {Utils} from "../../Utils";
import {Storage} from "../../Storage";

type StorageKey = keyof typeof Storage;

export class SettingsMenu extends GUI.Container {
    static availableSettings: { label: string, key: StorageKey }[] = [
        { label: "Color correction*", key: "colorCorrectionEnabled" },
        { label: "Bloom effect*", key: "bloomEffectEnabled" },
        { label: "Lens effects*", key: "lensEffectEnabled" },
    ];

    constructor() {
        super("Settings Menu");

        this.fontFamily = Utils.fontFamily;

        const panel = new BABYLON.GUI.StackPanel();
        this.addControl(panel);

        const textblock = new BABYLON.GUI.TextBlock("Settings Header", "Settings");
        textblock.color = "white";
        textblock.height = "50px";
        panel.addControl(textblock);

        for (let setting of SettingsMenu.availableSettings) {
            const button = new BABYLON.GUI.Checkbox("Settings Checkbox");
            button.checkSizeRatio = 0.6;
            button.width = "20px";
            button.height = "20px";
            button.color = "white";
            button.background = "rgba(255,255,255,0.1)";
            button.thickness = 0;
            button.isChecked = Storage[setting.key] as boolean;

            button.onIsCheckedChangedObservable.add((state) => {
                (Storage[setting.key] as any) = state;
            });

            const header = BABYLON.GUI.Control.AddHeader(button, setting.label, "200px", { isHorizontal: true, controlFirst: true });
            header.color = "white";
            header.height = "30px";

            panel.addControl(header);
        }

        const footerInfo = new BABYLON.GUI.TextBlock("Footer Info", "* = requires reload");
        footerInfo.color = "white";
        footerInfo.height = "30px";
        footerInfo.alpha = 0.5;
        panel.addControl(footerInfo);
    }
}
