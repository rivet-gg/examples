import keycode = require("keycode");

export type InputKeyList = (string | number)[];

export type InputCallback = (event: KeyboardEvent) => void;

export enum SubscribeType {
    Down, Up, Both
}

export class InputHandler {
    /* Keyboard */
    /// Array of key states
    private static keys: {[key: string]: boolean} = {};

    /// List of subscriptions to key down events
    private static keyDownSubscriptions: {[key: string]: InputCallback} = {};

    /// List of subscriptions to key up events
    private static keyUpSubscriptions: {[key: string]: InputCallback} = {};

    public static initialize() {
        document.addEventListener("keydown", e => InputHandler.onKeyDown(e), false);
        document.addEventListener("keyup", e => InputHandler.onKeyUp(e), false);
    }

    private static onKeyDown(event: KeyboardEvent) {
        let code = keycode(event);

        // Make sure the key is not already down, since `keydown` repeats over and over again
        if (this.keys[code]) return;

        // Save the state and trigger the event
        this.keys[code] = true;
        if (this.keyDownSubscriptions[code])
            this.keyDownSubscriptions[code](event);
    }

    private static onKeyUp(event: KeyboardEvent) {
        // Save the state and trigger the event
        let code = keycode(event);
        this.keys[code] = false;
        if (this.keyUpSubscriptions[code])
            this.keyUpSubscriptions[code](event);
    }

    /// Returns whether or not a list of keys are down
    public static key(...keys: InputKeyList): boolean {
        // Normalize
        keys = InputHandler.normalizeCodes(keys);

        // Return true if any of the keys are down
        for (let key of keys) {
            // Return true if is down
            let value = this.keys[key];
            if (value) // If not undefined and is true
                return true;
        }

        // Otherwise return false
        return false;
    }

    /// Subscribe to events
    public static subscribe(keys: InputKeyList, callback: InputCallback, subscribeType: SubscribeType = SubscribeType.Down) {
        // Normalize
        keys = InputHandler.normalizeCodes(keys);

        // Subscribe
        for (let key of keys) {
            if (subscribeType == SubscribeType.Down || subscribeType == SubscribeType.Both) {
                InputHandler.keyDownSubscriptions[key] = callback;
            }
            if (subscribeType == SubscribeType.Up || subscribeType == SubscribeType.Both) {
                InputHandler.keyUpSubscriptions[key] = callback;
            }
        }
    }

    /// Normalizes a list of key codes
    private static normalizeCodes(keys: InputKeyList): string[] {
        // Go through array and normalize codes to string
        for (let i = 0; i < keys.length; i++) {
            // Get the key's code
            let key = keys[i];
            if (typeof key === "string") {
                keys[i] = keycode(keycode(key)); // Normalize the keycode
            } else {
                keys[i] = keycode(key); // Convert key to a string
            }
        }

        return keys as string[];
    }

    /* Gamepad */
    /// Return a list of gamepads
    public static get gamepads(): Gamepad[] {
        return navigator.getGamepads ? navigator.getGamepads() : ((navigator as any).webkitGetGamepads ? (navigator as any).webkitGetGamepads() : []);
    }

    public static get leftJoystickX(): number { return this.axisValue(0); }
    public static get leftJoystickY(): number { return this.axisValue(1); }

    public static get rightJoystickX(): number { return this.axisValue(2); }
    public static get rightJoystickY(): number { return this.axisValue(3); }

    public static get arrowsX(): number { return this.axisValue(4); }
    public static get arrowsY(): number { return this.axisValue(5); }

    public static get leftBumper1(): number { return this.buttonValue(4); }
    public static get leftBumper1Pressed(): boolean { return this.buttonPressed(4); }

    public static get leftBumper2(): number { return this.buttonValue(6); }
    public static get leftBumper2Pressed(): boolean { return this.buttonPressed(6); }

    public static get rightBumper1(): number { return this.buttonValue(5); }
    public static get rightBumper1Pressed(): boolean { return this.buttonPressed(5); }

    public static get rightBumper2(): number { return this.buttonValue(7); }
    public static get rightBumper2Pressed(): boolean { return this.buttonPressed(7); }

    public static get buttonA(): number { return this.buttonValue(0); }
    public static get buttonAPressed(): boolean { return this.buttonPressed(0); }

    public static get buttonB(): number { return this.buttonValue(1); }
    public static get buttonBPressed(): boolean { return this.buttonPressed(1); }

    public static get buttonX(): number { return this.buttonValue(2); }
    public static get buttonXPressed(): boolean { return this.buttonPressed(2); }

    public static get buttonY(): number { return this.buttonValue(3); }
    public static get buttonYPressed(): boolean { return this.buttonPressed(3); }

    private static axisValue(index: number): number {
        let value = 0;
        for (let gamepad of this.gamepads) {
            if (gamepad instanceof Gamepad)
                value += gamepad.axes[index];
        }
        return value;
    }

    private static buttonValue(index: number): number {
        let value = 0;
        for (let gamepad of this.gamepads) {
            if (gamepad instanceof Gamepad)
                value += gamepad.buttons[index].value;
        }
        return value;
    }

    private static buttonPressed(index: number): boolean {
        for (let gamepad of this.gamepads) {
            if (gamepad instanceof Gamepad && gamepad.buttons[index].pressed)
                return true;
        }
        return false;
    }
}
