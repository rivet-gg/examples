import * as BABYLON from "babylonjs";
import GUI = BABYLON.GUI;
import {Utils} from "../../Utils";
import {GameResultsData} from "../../Connection";

export class GameResultsDisplay extends GUI.Rectangle {
    private scoreBreakdownContainer: GUI.StackPanel;

    public constructor() {
        super("Game Results GUI");

        this.background = "rgba(0,0,0,0.75)";
    }

    public renderResults(data: GameResultsData) {
        let [propsWon, scoreboardData, scoreBreakdown] = data;

        const TEMPTranslationLookup = {
            "killedPlayersScoring": "Killed players",
            "hitShotsScoring": "Hit shots",
            "percentHitScoring": "Percent shots hit",
            "propHealthScoring": "Prop health",
            "propPingCountScoring": "Ping count",
            "propTotalPingVolumeScoring": "Total ping volume",
            "winningTeamScoring": "Winning team",
            "losingTeamScoring": "Losing team",
            "firstScoring": "First place",
            "secondScoring": "Second place",
            "thirdScoring": "Third place",
            "didNotPlaceScoring": "Did not place",
            "totalScoring": "Total score"
        };

        // Remove previous elements
        if (this.scoreBreakdownContainer)
            this.removeControl(this.scoreBreakdownContainer);

        // Add score breakdown
        this.scoreBreakdownContainer = new GUI.StackPanel("Score Breakdown");
        this.scoreBreakdownContainer.isVertical = true;
        this.scoreBreakdownContainer.width = "450px";
        this.addControl(this.scoreBreakdownContainer);

        // Add the data
        const breakdownScoreDisplays: GUI.TextBlock[] = [];
        for (let breakdown of scoreBreakdown) {
            const holder = new GUI.StackPanel("Breakdown");
            holder.height = "26px";
            holder.isVertical = false;
            this.scoreBreakdownContainer.addControl(holder);

            if (breakdown == undefined) { // If it's undefined, just add a space
                breakdownScoreDisplays.push(undefined);
                continue;
            }

            const text = new GUI.TextBlock("Label", TEMPTranslationLookup[breakdown[0]].toUpperCase());
            if (breakdown[1]) { text.text += " x " + breakdown[1]; }
            text.width = 0.8;
            text.fontSize = 15;
            text.textHorizontalAlignment = GUI.TextBlock.HORIZONTAL_ALIGNMENT_LEFT;
            text.resizeToFit = false;
            text.color = "white";
            text.fontFamily = Utils.fontFamily;
            holder.addControl(text);

            const score = new GUI.TextBlock("Score", "0");
            score.width = 0.2;
            score.alpha = 0.25; // This will be transparent until it's added up
            score.fontSize = 23;
            score.textHorizontalAlignment = GUI.TextBlock.HORIZONTAL_ALIGNMENT_RIGHT;
            score.color = "white";
            score.fontStyle = "bold";
            score.fontFamily = Utils.fontFamily;
            holder.addControl(score);
            breakdownScoreDisplays.push(score);
        }

        // Animate the data
        const scoreIncrement = 31;
        let scoreIndex = 0;
        let currentCount = 0;
        const intervalHandle = setInterval(() => {
            // Handle stop cases
            if (scoreIndex > scoreBreakdown.length) {
                clearInterval(intervalHandle);
                return;
            } else if (scoreBreakdown[scoreIndex] == undefined) {
                currentCount = 0;
                scoreIndex += 1;
                return;
            }

            // Highlight and show the new score
            const target = scoreBreakdown[scoreIndex][2];
            const scoreDisplay = breakdownScoreDisplays[scoreIndex];
            currentCount += scoreIncrement;
            scoreDisplay.alpha = 1.0;
            if (currentCount >= target) {
                scoreDisplay.text = target.toString();
                currentCount = 0;
                scoreIndex += 1;
            } else {
                scoreDisplay.text = currentCount.toString();
            }
        }, 0.05);
    }
}
