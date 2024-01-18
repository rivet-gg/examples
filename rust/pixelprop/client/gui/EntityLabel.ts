import * as BABYLON from "babylonjs";
import GUI = BABYLON.GUI;
import {Entity} from "../Entity";
import {ProgressBar} from "./ProgressBar";
import {Utils} from "../Utils";
import {float, int} from "../types";
import {Game} from "../Game";

export class EntityLabel extends GUI.StackPanel {
    private usernameLabel: GUI.TextBlock;
    private healthBar: ProgressBar;

    private lastHealthChangeTime: int = 0; // Timestamp of the last time the health changed

    private get shouldStayVisible(): boolean {
        return this.entity.id == Game.shared.mainPlayerId || this.entity.id == Game.shared.spectatingId || this.entity.isHunter;
    }

    constructor(private entity: Entity) {
        super("Entity Label");

        // console.log("new label", this.shouldStayVisible, entity.id);

        this.linkOffsetY = "-20px";
        this.zIndex = -100;
        this.width = "600px";
        this.alpha = this.shouldStayVisible ? 1 : 0; // Hide it so the bar doesn't show right after an entity spawns

        this.usernameLabel = new GUI.TextBlock("Label", "");
        this.usernameLabel.height = "26px";
        this.usernameLabel.fontFamily = Utils.fontFamily;
        this.usernameLabel.color = "white";
        this.usernameLabel.fontSize = 20;
        this.usernameLabel.fontStyle = "bold";
        this.addControl(this.usernameLabel);

        this.healthBar = new ProgressBar("Health", { color: "#ff0000" });
        this.healthBar.width = "96px";
        this.healthBar.height = "16px";
        this.addControl(this.healthBar);

        this.updateLabel(false);
    }

    public updateLabel(animated: boolean = true) {
        // Hide the health if it's a hunter
        this.healthBar.isVisible = !this.entity.isHunter;

        // Update the label
        this.usernameLabel.text = this.entity.label;

        // Change or animate the health if needed
        if (animated) {
            // Make it fade away with the lerp in the after observable
            this.lastHealthChangeTime = Date.now();
        } else {
            // Force the progress
            this.healthBar.progress = this.entity.health;
        }
    }

    public update(dt: float) {
        // Lerp the progress
        this.healthBar.progress = Math.lerp(this.healthBar.progress, this.entity.health, 8 * dt);

        // Make the label fade away after it's been a long time since the health changed
        let fadeProgress: float = 1; // How much the label should fade away
        if (this.shouldStayVisible) {
            fadeProgress = 0;
        } else {
            const healthFadeDelay = 1000;
            const healthFadeLength = 200;
            fadeProgress = ((Date.now() - this.lastHealthChangeTime) - healthFadeDelay) / healthFadeLength;
        }
        this.scaleX = this.scaleY = this.alpha = 1 - Math.clamp01(fadeProgress);
    }
}
