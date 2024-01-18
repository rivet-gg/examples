import * as BABYLON from "babylonjs";
import GUI = BABYLON.GUI;
import {ScoreboardData} from "../../Connection";
import {Utils} from "../../Utils";

export class Scoreboard extends GUI.Rectangle {
    private scoresStack: GUI.StackPanel;

    constructor() {
        super("Scoreboard");

        this.thickness = 0;
        this.background = "rgba(0,0,0,0.75)";
    }

    public displayData(data: ScoreboardData) {
        // TODO: Make this reuse items so it's not updating all the time

        // Remove previous elements
        if (this.scoresStack)
            this.removeControl(this.scoresStack);

        // Add stack container
        const totalWidth = 300;
        this.scoresStack = new GUI.StackPanel("Scores");
        this.scoresStack.isVertical = true;
        this.scoresStack.width = totalWidth + "px";
        this.addControl(this.scoresStack);

        // Add the data
        for (let scoreData of data) {
            const holder = new GUI.StackPanel("Breakdown");
            holder.height = "26px";
            holder.isVertical = false;
            this.scoresStack.addControl(holder);

            const state = new GUI.TextBlock("State", scoreData[1] ? "P" : "H");
            state.width = "25px";
            state.fontSize = 15;
            state.textHorizontalAlignment = GUI.TextBlock.HORIZONTAL_ALIGNMENT_LEFT;
            state.color = "white";
            state.fontFamily = Utils.fontFamily;
            holder.addControl(state);

            const text = new GUI.TextBlock("Label", scoreData[2]);
            text.width = (totalWidth - 25 - 100) + "px";
            text.fontSize = 15;
            text.textHorizontalAlignment = GUI.TextBlock.HORIZONTAL_ALIGNMENT_LEFT;
            text.color = "white";
            text.fontFamily = Utils.fontFamily;
            holder.addControl(text);

            const score = new GUI.TextBlock("Score", scoreData[3].toString());
            score.width = "100px";
            score.fontSize = 15;
            score.textHorizontalAlignment = GUI.TextBlock.HORIZONTAL_ALIGNMENT_RIGHT;
            score.color = "white";
            score.fontStyle = "bold";
            score.fontFamily = Utils.fontFamily;
            holder.addControl(score);
        }
    }
}
