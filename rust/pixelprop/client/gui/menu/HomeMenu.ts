import * as BABYLON from "babylonjs";
import GUI = BABYLON.GUI;
import {Game} from "../../Game";
import {Utils} from "../../Utils";
import {Storage} from "../../Storage";

export class HomeMenu extends GUI.Container {
    private usernameField: GUI.InputText;

    public constructor() {
        super("Home Menu");

        const stack = new BABYLON.GUI.Container();
        stack.width = "250px";
        this.addControl(stack);

        const offset = 50;

        this.usernameField = new BABYLON.GUI.InputText("Username Field");
        this.usernameField.text = Storage.username;
        this.usernameField.width = 1;
        this.usernameField.height = "40px";
        this.usernameField.top = -offset / 2 + "px";
        this.usernameField.placeholderColor = "rgba(255,255,255,0.1)";
        this.usernameField.color = "white";
        this.usernameField.background = "transparent";
        this.usernameField.placeholderText = "Username";
        this.usernameField.fontFamily = Utils.fontFamily;
        this.usernameField.onTextChangedObservable.add((ev) => {
            Storage.username = ev.text;
        });
        stack.addControl(this.usernameField);

        const joinButton = BABYLON.GUI.Button.CreateSimpleButton("Join Button", "Join");
        joinButton.width = 1;
        joinButton.height = "40px";
        joinButton.top = offset / 2 + "px";
        joinButton.color = "white";
        joinButton.onPointerUpObservable.add(() => {
            // Join the game
            Game.shared.connection.sendJoin();

            // Capture the pointer
            Game.shared.canvas.requestPointerLock();
        });
        stack.addControl(joinButton);
    }
}
