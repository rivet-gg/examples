import "babylonjs-loaders";
import "babylonjs-gui";
import {Game} from "./Game";

// Implement magic
import "./Magic";
import {InputHandler} from "./InputHandler";

// Init function
function init() {
    // Input handler
    InputHandler.initialize();

    // Create the canvas
    let canvas = document.createElement("canvas");
    canvas.style.touchAction = "none"; // For pointer events polyfill
    document.body.appendChild(canvas);

    // Start the game
    new Game(canvas);
}

// Initiate the game when load
addEventListener("load", () => init());
