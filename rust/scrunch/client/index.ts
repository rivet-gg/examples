import { Game } from "./Game";

// Implement magic
import "./Magic";

// Init function
function init() {
    // Resize the canvas on window resize
    addEventListener("resize", () => Game.shared.updateSize());

    // Start the game
    Game.shared = new Game();
    document.body.appendChild(Game.shared.view);
    Game.shared.begin();
}

// Initiate the game when load
addEventListener("load", () => init());

