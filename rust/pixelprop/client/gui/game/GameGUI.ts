import * as BABYLON from "babylonjs";
import GUI = BABYLON.GUI;
import {Minimap} from "./Minimap";
import {ProgressBar} from "../ProgressBar";
import {Game, GameServerState} from "../../Game";
import {Utils} from "../../Utils";
import {float} from "../../types";
import {GameResultsDisplay} from "./GameResultsDisplay";
import {GameResultsData} from "../../Connection";
import {Scoreboard} from "./Scoreboard";
import {PointerLockGUI} from "../PointerLockGUI";

export class GameGUI extends GUI.Rectangle {
    public pointerLockGUI: PointerLockGUI;
    public hitMarker: GUI.Image;

    public scoreboard: Scoreboard;
    public gameResults: GameResultsDisplay;

    public minimap: Minimap;

    public pingTimer: ProgressBar;
    public shootTimer: ProgressBar;
    public staminaBar: ProgressBar;

    public countdownTimerContainer: GUI.StackPanel;
    public countdownCharacters: GUI.TextBlock[] = [];
    public gameStateLabel: GUI.TextBlock;

    constructor() {
        super("Game GUI");

        this.fontFamily = Utils.fontFamily;
        this.thickness = 0;

        this.pointerLockGUI = new PointerLockGUI();
        this.addControl(this.pointerLockGUI);

        this.hitMarker = new GUI.Image("Hit Marker", "/img/hit-marker.png");
        this.hitMarker.width = this.hitMarker.height = "32px";
        this.addControl(this.hitMarker);

        this.gameResults = new GameResultsDisplay();
        this.gameResults.isVisible = false;
        this.addControl(this.gameResults);

        this.scoreboard = new Scoreboard();
        this.scoreboard.isVisible = false;
        this.addControl(this.scoreboard);

        this.minimap = new Minimap(Minimap.minimapScaleClose, Game.shared.scene);
        this.addControl(this.minimap);

        this.pingTimer = new ProgressBar("Ping Timer", { color: "#00f49c" });
        this.pingTimer.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.pingTimer.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.pingTimer.top = "-60px";
        this.pingTimer.left = "-30px";
        this.pingTimer.width = "96px";
        this.pingTimer.height = "16px";
        this.pingTimer.isVisible = false;
        this.addControl(this.pingTimer);

        this.shootTimer = new ProgressBar("Shoot Timer", { color: "#d21000" });
        this.shootTimer.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.shootTimer.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.shootTimer.top = "-60px";
        this.shootTimer.left = "-30px";
        this.shootTimer.width = "96px";
        this.shootTimer.height = "16px";
        this.shootTimer.isVisible = false;
        this.addControl(this.shootTimer);

        this.staminaBar = new ProgressBar("Stamina Bar", { color: "#ffffff" });
        this.staminaBar.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.staminaBar.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.staminaBar.top = "-30px";
        this.staminaBar.left = "-30px";
        this.staminaBar.width = "96px";
        this.staminaBar.height = "16px";
        this.addControl(this.staminaBar);

        this.countdownTimerContainer = new GUI.StackPanel("Countdown Timer Container");
        this.countdownTimerContainer.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        this.countdownTimerContainer.top = "28px";
        this.countdownTimerContainer.height = "50px";
        this.countdownTimerContainer.isVertical = false;
        for (let i = 0; i < 5; i++) {
            const text = new GUI.TextBlock("Countdown Digit", i == 2 ? ":" : "-");
            text.width = "50px";
            text.color = "white";
            text.fontFamily = Utils.fontFamily;
            text.fontSize = 40;
            this.countdownTimerContainer.addControl(text);
            this.countdownCharacters.push(text);
        }
        this.addControl(this.countdownTimerContainer);

        this.gameStateLabel = new GUI.TextBlock("Game State Label", "Game state");
        this.gameStateLabel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        this.gameStateLabel.top = "80px";
        this.gameStateLabel.height = "40px";
        this.gameStateLabel.color = "white";
        this.gameStateLabel.fontFamily = Utils.fontFamily;
        this.gameStateLabel.fontSize = 16;
        this.addControl(this.gameStateLabel);
    }

    public update(dt: float) {
        // Update pointer lock visibility
        this.pointerLockGUI.isVisible = Game.shared.isPlaying && document.pointerLockElement !== Game.shared.canvas;

        // Update minimap
        this.minimap.update(dt);

        // Get timer attributes
        const finalCountdownLength = 10;
        const countdownProgress = Math.max(finalCountdownLength - Game.shared.gameStateTimer, 0) / finalCountdownLength;
        const pulseProgress = countdownProgress * (Math.sin(Date.now() / 1000 * Math.PI * 2) / 2 + 0.5);

        // Update timer
        const timerScale = 1 + pulseProgress * 0.15;
        this.countdownTimerContainer.scaleX = this.countdownTimerContainer.scaleY = timerScale;
        for (let char of this.countdownCharacters) {
            const colorFade = Math.floor((1 - pulseProgress) * 255);
            char.color = `rgba(255,${colorFade},${colorFade},1)`;
        }
    }

    public updateTimer(time: float) {
        // Update the time
        if (time == -1) {
            this.countdownCharacters[0].text =
                this.countdownCharacters[1].text =
                    this.countdownCharacters[3].text =
                        this.countdownCharacters[4].text = "-";
        } else {
            const pad = "00"; // Make sure there's two characters
            const timeInt = Math.ceil(time);
            let minutes = Math.floor(timeInt / 60).toString();
            let seconds = (timeInt % 60).toString();
            minutes = pad.substring(0, pad.length - minutes.length) + minutes;
            seconds = pad.substring(0, pad.length - seconds.length) + seconds;
            this.countdownCharacters[0].text = minutes[0];
            this.countdownCharacters[1].text = minutes[1];
            this.countdownCharacters[3].text = seconds[0];
            this.countdownCharacters[4].text = seconds[1];
        }
    }

    public updateGameServerState(state: GameServerState) {
        if (state != GameServerState.PreGame) {
            this.gameResults.isVisible = false;
        }

        // For testing the scoring screen:
        // this.gameResults.isVisible = true;
        // this.gameResults.renderResults([
        //     true,
        //     [],
        //     [
        //         ["killedPlayersScoring", Math.floor(Math.random() * 20).toString(), Math.floor(Math.random() * 2000)],
        //         ["hitShotsScoring", Math.floor(Math.random() * 20).toString(), Math.floor(Math.random() * 2000)],
        //         ["percentHitScoring", Math.floor(Math.random() * 20).toString(), Math.floor(Math.random() * 2000)],
        //         undefined,
        //         ["propHealthScoring", Math.floor(Math.random() * 20).toString(), Math.floor(Math.random() * 2000)],
        //         ["propPingCountScoring", Math.floor(Math.random() * 20).toString(), Math.floor(Math.random() * 2000)],
        //         ["propTotalPingVolumeScoring", Math.floor(Math.random() * 20).toString(), Math.floor(Math.random() * 2000)],
        //         undefined,
        //         ["winningTeamScoring", Math.floor(Math.random() * 20).toString(), Math.floor(Math.random() * 2000)],
        //         undefined,
        //         ["losingTeamScoring", Math.floor(Math.random() * 20).toString(), Math.floor(Math.random() * 2000)],
        //         undefined,
        //         ["totalScoring", Math.floor(Math.random() * 20).toString(), Math.floor(Math.random() * 2000)]
        //     ]
        // ]);

        let stateLabel: string;
        switch (state) {
            case GameServerState.PreGame:
                stateLabel = "Waiting for game to start";
                break;
            case GameServerState.Hiding:
                stateLabel = "Props hiding";
                break;
            case GameServerState.Hunting:
                stateLabel = "Hunting props";
                break;
            default:
                stateLabel = "Unknown";
                console.error("Unknown server state", state);
                break;
        }
        this.gameStateLabel.text = stateLabel.toUpperCase();
    }

    public displayGameResults(results: GameResultsData) {
        // Render the results
        this.gameResults.renderResults(results);

        // Show the results
        this.gameResults.isVisible = true;
    }
}
