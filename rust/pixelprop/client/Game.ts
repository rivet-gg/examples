import * as BABYLON from "babylonjs";
import {float, int} from "./types";
import {Entity, EntityData, EntityId, EntityRotation, EntityState, EPF} from "./Entity";
import {Connection} from "./Connection";
import {InputHandler, SubscribeType} from "./InputHandler";
import {NodeNames, StoreData, Utils} from "./Utils";
import {Assets} from "./Assets";
import {MenuGUI} from "./gui/menu/MenuGUI";
import {GameGUI} from "./gui/game/GameGUI";
import {HomeMenu} from "./gui/menu/HomeMenu";
import {DisconnectGUI} from "./gui/DisconnectGUI";
import {EntityLabel} from "./gui/EntityLabel";
import {SpotLightPlaceholder} from "./SpotLightPlaceholder";
import {Storage} from "./Storage";
import {Minimap} from "./gui/game/Minimap";

export enum ClientEventFlag {
    GameState = 0, Shoot = 1, Ping = 2, PlayerDeath = 3, ScoreboardUpdate = 4
}
export type ClientEvent = [ClientEventFlag, any];

export enum GameState {
    Menu, Playing, Spectating, Disconnected
}

export enum GameServerState {
    PreGame = 0, Hiding = 1, Hunting = 2
}

export class Game {
    public static SPOT_LIGHT_COUNT = 1;
    public static SHOOT_FLASH_COUNT = 2;
    public static get MAX_SIMULTANEOUS_LIGHTS(): int {
        return 1 + this.SPOT_LIGHT_COUNT + this.SHOOT_FLASH_COUNT; // Spectating light + spot light + flash count
    };

    private static FLASH_ANIMATION_NAME = "Flash Animation";

    static shared: Game;

    // Babylon
    public canvas: HTMLCanvasElement;
    public engine: BABYLON.Engine;
    public scene: BABYLON.Scene;
    public cameraParent: BABYLON.TransformNode;
    public camera: BABYLON.ArcRotateCamera;
    public worldNode: BABYLON.TransformNode;

    public sceneInstrumentation?: BABYLON.SceneInstrumentation;
    public engineInstrumentation?: BABYLON.EngineInstrumentation;

    public sharedMaterial: BABYLON.StandardMaterial;
    public sharedGlowingMaterial: BABYLON.StandardMaterial;

    public sharedSleepingBoundingBox: BABYLON.StandardMaterial;
    public sharedAwakeBoundingBox: BABYLON.StandardMaterial;

    public sharedBulletMaterial: BABYLON.StandardMaterial;

    public spectatingLight: BABYLON.PointLight;

    private spotLights: { light: BABYLON.SpotLight }[] = [];

    private shootFlashIndex: int = 0; // Index at which light the next flash should use
    private shootFlashes: BABYLON.PointLight[] = [];

    // GUI
    public uiTexture: BABYLON.GUI.AdvancedDynamicTexture;
    public debugText: BABYLON.GUI.TextBlock;

    public gameGUI: GameGUI;
    public menuGUI: MenuGUI;
    public disconnectGUI: DisconnectGUI;

    private entityLabels: { [entity: number]: EntityLabel } = { }; // [EntityId: EntityLabel]

    // Data
    public storeData: StoreData = Utils.defaultStoreData;

    // Connection
    public connection: Connection;

    // Basics
    private previousUpdate: int = -1;

    // Entities
    public mapSize: float;

    private _mainPlayerId?: int;
    public get mainPlayerId(): int { return this._mainPlayerId; }
    public set mainPlayerId(value: int) {
        if (value != this._mainPlayerId) {
            this._mainPlayerId = value;
            this.updateState();
        }
    }
    public get mainPlayer(): Entity | undefined {
        if (this.mainPlayerId != undefined) {
            return this.entityForId(this.mainPlayerId) as Entity;
        } else {
            return undefined;
        }
    }
    public get mainPlayerExists(): boolean {
        return this.mainPlayerId != undefined && this.mainPlayer != undefined;
    }

    // Note that this spectating ID is different than the server's spectating ID. While `_spectatingId` matches the server
    // value, the `spectatingId` getter either returns the spectating ID or the main player if not spectating
    private _spectatingId?: int;
    public get spectatingId(): int { return this._spectatingId != undefined ? this._spectatingId : this._mainPlayerId; }
    public set spectatingId(value: int) {
        if (value != this._spectatingId) {
            this._spectatingId = value;
            this.updateState();
        }
    }
    public get spectating(): Entity | undefined {
        if (this.spectatingId != undefined) {
            return this.entityForId(this.spectatingId) as Entity;
        } else {
            return undefined;
        }
    }
    public get spectatingExists(): boolean {
        return this.spectatingId != undefined && this.spectating != undefined;
    }

    public entities: { [id: number]: Entity } = { };

    // Entities that are not being used
    private entityPool : Entity[] = [];

    // Ping delay
    private pingStart: int; // ms
    private pingDelay: int; // ms

    // Shoot delay
    private shootStart: int; // ms
    private shootDelay: int; // ms

    // Stamina
    private stamina: float = 1;

    // Raw input
    private mouseX: float = 0;
    private mouseY: float = 0;

    // Input
    private moveDir: float | undefined = undefined;
    private lastSentAimDir: float = undefined;
    private aimDir: float = 0;
    private verticalAimDir: float = 0; // Not sent to server
    private targetRot: EntityRotation = 0;
    private firing: boolean = false;
    private sprinting: boolean = false;

    // Render properties
    public get resolution(): float {
        return 1;
    }
    public get width(): float {
        return this.canvas.width / this.resolution;
    }
    public get height(): float {
        return this.canvas.height / this.resolution;
    }
    public cameraCenter: BABYLON.Vector3 = BABYLON.Vector3.Zero();
    private verticalAimDirCap = Math.PI * 0.15;
    private cameraAlphaBase = Math.PI * -0.5;
    private cameraBetaBase = Math.PI * 0.4;
    private cameraHeight = 30;
    private cameraDistanceClose = 90;
    private cameraFovClose = Math.PI * 0.25;
    private cameraDistanceFar = 110;
    private cameraFovFar = Math.PI * 0.4;

    // Lighting
    public lightColor: BABYLON.Color3 = BABYLON.Color3.FromHexString("#ffffff");
    public lightColorSpecular: BABYLON.Color3 = BABYLON.Color3.FromHexString("#ffffff");
    public flashlightIntensity = 10;
    public currentSpectatingLightRange = 0;
    public spectatingLightRangeLerpSpeed = 1;
    public hunterLightRadius = 100;
    public propLightRadius = 200;

    // Server state
    private _gameServerState: GameServerState = undefined;
    public get gameServerState(): GameServerState { return this._gameServerState; }
    public set gameServerState(state: GameServerState) {
        if (state != this._gameServerState) {
            this._gameServerState = state;
            this.updateServerState();
        }
    }

    private _gameStateTimer: int = 0;
    public get gameStateTimer(): int { return this._gameStateTimer; }
    public set gameStateTimer(timer: int) {
        this._gameStateTimer = timer;
        this.gameGUI.updateTimer(timer);
    }

    // State
    public get gameState(): GameState {
        if (this.connection && this.connection.isDisconnected) {
            return GameState.Disconnected;
        } else if (this.mainPlayerId != undefined) { // Main entity may not be spawned yet, so we only check the ID
            return GameState.Playing;
        } else if (this.spectatingId != undefined) { // Same as main player entity
            return GameState.Spectating;
        } else {
            return GameState.Menu;
        }
    }
    public get isPlaying(): boolean { return this.gameState == GameState.Playing; }
    public get isSpectating(): boolean { return this.gameState == GameState.Spectating; }
    public get inMenu(): boolean { return this.gameState == GameState.Menu; }

    constructor(canvas: HTMLCanvasElement) {
        (window as any).theGame = this; // TODO: Remove this

        Game.shared = this;
        this.canvas = canvas;

        // Create the engine
        this.createEngine();

        // Create the scene
        this.createScene();

        // Create the GUI
        this.createGUI();

        // Register the events
        this.registerEvents();

        // Update the state
        this.updateState();

        // Create the connection
        this.connection = new Connection();

        // Load the given data
        Assets.loadAssets({
            samplingModeOverrides: {
                "img/grass-base.png": BABYLON.Texture.NEAREST_SAMPLINGMODE,
                "img/grass-top.png": BABYLON.Texture.NEAREST_SAMPLINGMODE
            }
        }).then(() => {
            // Create a glowing material
            this.sharedMaterial = Assets.defaultMaterial;
            this.sharedMaterial.maxSimultaneousLights = Game.MAX_SIMULTANEOUS_LIGHTS;
            this.sharedGlowingMaterial = this.sharedMaterial.clone("Shared Glowing Material");
            this.sharedGlowingMaterial.emissiveColor = BABYLON.Color3.White().scale(0.3);
            this.sharedMaterial.freeze();
            this.sharedGlowingMaterial.freeze();

            // Start playing the music
            const ambient = Assets.ambient;
            ambient.spatialSound = false; // All other sounds are spatial by default
            ambient.loop = true;
            ambient.play();

            // Begin the application, now that we've finished loading the core assets
            this.begin();
        });
    }

    /* Init */
    private createEngine() {
        // Tweak optimizations
        (BABYLON.Scene as any).lensFlaresEnabled = false;
        (BABYLON.Scene as any).probesEnabled = false;
        (BABYLON.Scene as any).proceduralTexturesEnabled = false;
        (BABYLON.Scene as any).skeletonsEnabled = false;

        BABYLON.StandardMaterial.AmbientTextureEnabled = false;
        BABYLON.StandardMaterial.OpacityTextureEnabled = false;
        BABYLON.StandardMaterial.ReflectionTextureEnabled = false;
        BABYLON.StandardMaterial.EmissiveTextureEnabled = false;
        BABYLON.StandardMaterial.SpecularTextureEnabled = false;
        BABYLON.StandardMaterial.BumpTextureEnabled = false;
        BABYLON.StandardMaterial.LightmapTextureEnabled = false;
        BABYLON.StandardMaterial.RefractionTextureEnabled = false;
        BABYLON.StandardMaterial.ColorGradingTextureEnabled = false;
        BABYLON.StandardMaterial.FresnelEnabled = false;

        // Add the engine
        this.engine = new BABYLON.Engine(this.canvas, true);
    }

    private createScene() {
        const clearColor = new BABYLON.Color3(0, 0, 0);

        // Create scene
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.autoClear = false; // Turn off auto clear, since we have geometries covering the screen at all times
        this.scene.autoClearDepthAndStencil = false; // ^
        this.scene.headphone = false;
        this.scene.clearColor = clearColor.toColor4();

        // Add fog
        this.scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
        this.scene.fogEnd = 300 + this.cameraDistanceClose;
        this.scene.fogStart = this.scene.fogEnd - 50;
        this.scene.fogColor = clearColor;

        // Add optimizations
        // const optimizationOptions = new BABYLON.SceneOptimizerOptions();
        // optimizationOptions.addOptimization(new BABYLON.HardwareScalingOptimization(0, 1));
        // const optimization = new BABYLON.SceneOptimizer(this.scene, optimizationOptions);

        // Create the node that all the entities are children of
        this.worldNode = new BABYLON.TransformNode("World Node", this.scene);
        this.worldNode.scaling.z = -1;

        // Create a camera parent
        this.cameraParent = new BABYLON.TransformNode("Camera Parent", this.scene);
        this.cameraParent.rotation.set(-Math.PI / 2, 0, 0);

        // Add camera; see diagram at http://doc.babylonjs.com/babylon101/cameras
        this.camera = new BABYLON.ArcRotateCamera(
            "Camera",
            this.cameraAlphaBase, // Rotate left/right; pi * 0.5 is the center
            this.cameraBetaBase, // Rotate up/down; pi * 0.5 is the top down
            this.cameraDistanceClose,
            BABYLON.Vector3.Zero(),
            this.scene
        );
        this.camera.parent = this.cameraParent;
        this.camera.upVector = new BABYLON.Vector3(0, 1, 0);

        // Create bounding box material
        this.sharedSleepingBoundingBox = new BABYLON.StandardMaterial("Sleeping Bounding Box", this.scene);
        this.sharedSleepingBoundingBox.diffuseColor = this.sharedSleepingBoundingBox.emissiveColor = new BABYLON.Color3(1, 0, 0);
        this.sharedSleepingBoundingBox.wireframe = true;

        this.sharedAwakeBoundingBox = new BABYLON.StandardMaterial("Awake Bounding Box", this.scene);
        this.sharedAwakeBoundingBox.diffuseColor = this.sharedAwakeBoundingBox.emissiveColor = new BABYLON.Color3(0, 1, 0);
        this.sharedAwakeBoundingBox.wireframe = true;

        // Create bullet material
        this.sharedBulletMaterial = new BABYLON.StandardMaterial("Bullet Material", this.scene);
        this.sharedBulletMaterial.emissiveColor.set(1, 1, 1);

        // Create the spectating light to illuminate the entity being spectated
        this.spectatingLight = new BABYLON.PointLight("Spectating Light", new BABYLON.Vector3(0, 0, 10), this.scene);
        this.spectatingLight.diffuse = this.lightColor;
        this.spectatingLight.specular = this.lightColorSpecular;
        this.spectatingLight.parent = this.worldNode;

        // Add spotlights
        for (let i = 0; i < Game.SPOT_LIGHT_COUNT; i++) {
            const light = new BABYLON.SpotLight(
                NodeNames.SPOT_LIGHT,
                new BABYLON.Vector3(1, 0, 0),
                new BABYLON.Vector3(1, 0, 0),
                Math.PI / 2,
                30,
                this.scene
            );
            // light.projectionTexture = new BABYLON.Texture("https://www.babylonjs-playground.com/textures/co.png", this.scene);
            this.spotLights.push({ light: light });
        }

        // Add shoot lights
        for (let i = 0; i < Game.SHOOT_FLASH_COUNT; i++) {
            // Create the flash
            const flash = new BABYLON.PointLight("Gun Flash", BABYLON.Vector3.Zero(), this.scene);
            flash.range = 200;
            flash.intensity = 0;
            flash.parent = this.worldNode;
            this.shootFlashes.push(flash);

            // Add flash animation
            const fps = 30;
            const flashLength = fps * 0.6;
            const animation = new BABYLON.Animation(
                Game.FLASH_ANIMATION_NAME,
                "intensity",
                fps,
                BABYLON.Animation.ANIMATIONTYPE_FLOAT,
                BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
            );
            animation.setKeys([
                { frame: 0, value: 1 },
                { frame: flashLength, value: 0 }
            ]);
            const easing = new BABYLON.QuarticEase();
            easing.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT);
            animation.setEasingFunction(easing);
            flash.animations = [ animation ];
        }

        // Default pipeline
        const defaultPipeline = new BABYLON.DefaultRenderingPipeline("Default Rendering Pipeline", true, this.scene, [this.camera]);
        // defaultPipeline.fxaaEnabled = true;
        if (Storage.bloomEffectEnabled) {
            defaultPipeline.bloomEnabled = true;
            defaultPipeline.bloomWeight = 0.2;
            defaultPipeline.bloomScale = 0.8;
            defaultPipeline.bloomThreshold = 0.2;
        }

        // Color correction
        if (Storage.colorCorrectionEnabled) {
            const colorCorrection = new BABYLON.ColorCorrectionPostProcess("Color Correction", "/img/lut.png", 1.0, this.camera);
        }

        // Lens effect
        if (Storage.lensEffectEnabled) {
            const lensEffect = new BABYLON.LensRenderingPipeline("Lens Effect", {
                chromatic_aberration: 0.5,
                edge_blur: 0.0,
                distortion: 0.1,
                grain_amount: 0.8,
                // DOF disabled
            }, this.scene, 1.0, [this.camera]);
        }

        // SSAO
        // const ssao = new BABYLON.SSAORenderingPipeline("SSAO Pipeline", this.scene, 0.75, [this.camera]);
    }

    private createGUI() {
        // Create the GUI texture
        this.uiTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("Main GUI", true, this.scene);
        // this.uiTexture.idealHeight = 600;

        /* Debug */
        this.debugText = new BABYLON.GUI.TextBlock();
        this.debugText.text = "Hello world";
        this.debugText.color = "white";
        this.debugText.left = this.debugText.top = "20px";
        this.debugText.fontSize = 10;
        this.debugText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.debugText.textVerticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
        this.debugText.isVisible = false;
        this.uiTexture.addControl(this.debugText);

        // Game
        this.gameGUI = new GameGUI();
        this.uiTexture.addControl(this.gameGUI);

        // Menu
        this.menuGUI = new MenuGUI();
        this.uiTexture.addControl(this.menuGUI);

        // Disconnect
        this.disconnectGUI = new DisconnectGUI();
        this.uiTexture.addControl(this.disconnectGUI);
    }

    private registerEvents() {
        /* Resize Events */
        this.resize();
        window.addEventListener("resize", () => this.resize());

        /* Pointer lock events */
        this.canvas.addEventListener("click", (ev) => this.isPlaying && this.canvas.requestPointerLock());
        this.canvas.addEventListener("mousemove", (ev) => {
            if (document.pointerLockElement !== this.canvas) return;

            const mainPlayer = this.mainPlayer;
            if (this.mainPlayer === undefined) return;

            // Set the new aim dir
            const movementAdjustment = 1 / 2500 * Math.PI * 2;
            this.aimDir -= ev.movementX * movementAdjustment;
            this.verticalAimDir = Math.clamp(this.verticalAimDir + ev.movementY * movementAdjustment, -this.verticalAimDirCap, this.verticalAimDirCap);

            // Set state on main player
            this.mainPlayer.setDir(this.aimDir);

            // Send to the server
            this.updateMoveDir();
            if (this.lastSentAimDir == undefined || Math.abs(this.aimDir - this.lastSentAimDir) > Math.PI * 0.05) {
                this.connection.sendFaceDir(this.aimDir);
                this.lastSentAimDir = this.aimDir;
            }
        });

        /* Pointer Events */
        this.canvas.addEventListener("pointermove", (ev) => {
            this.updateMousePos(ev);
        });
        this.canvas.addEventListener("pointerdown", (ev) => {
            this.firing = true;
            this.updateMousePos(ev);
            this.shootAt(this.width / 2, this.height / 2);
        });
        this.canvas.addEventListener("pointerup", (ev) => {
            this.firing = false;
            this.updateMousePos(ev);
        });

        /* Keyboard Controls */
        // Update general input
        InputHandler.subscribe(["w","a","s","d","up","left","down","right","shift"], () => this.updateMoveDir(), SubscribeType.Both);

        // Jump
        InputHandler.subscribe(["space"], () => this.isPlaying && this.connection.sendJump());

        // Join event
        InputHandler.subscribe(["enter"], () => {
            // Automatically send join if on home menu only
            if (this.inMenu && this.menuGUI.menuContent instanceof HomeMenu) {
                this.connection.sendJoin();
            }
        });

        // Update rotation
        InputHandler.subscribe(["q"], () => this.isPlaying && this.rotateBy(1));
        InputHandler.subscribe(["e"], () => this.isPlaying && this.rotateBy(-1));

        // Pick new object
        InputHandler.subscribe(["f"], () => this.isPlaying && this.switchObject(this.width / 2, this.height / 2));

        // Force ping
        InputHandler.subscribe(["x"], () => this.isPlaying && this.connection.sendForcePing());

        // Display score
        InputHandler.subscribe(["g"], () => this.gameGUI.scoreboard.isVisible = InputHandler.key("g"), SubscribeType.Both);

        // Show map
        InputHandler.subscribe(["m"], () => this.gameGUI.minimap.fullMapView = InputHandler.key("m"), SubscribeType.Both);

        /* Temp Controls */
        function hasDebugModifier(): boolean { return InputHandler.key("option"); }

        // Cheat code
        InputHandler.subscribe(["\\"], () => hasDebugModifier() && this.connection.sendCheatCode(prompt("Cheat code")));

        // State change
        for (let i = 1; i < 6; i++) {
            InputHandler.subscribe([i.toString()], () => hasDebugModifier() && this.connection.tempSwitchServerState(i));
        }

        // Add light toggle
        InputHandler.subscribe(["l"], () => {
            if (!hasDebugModifier()) return;

            // Make the light radius really large
            this.hunterLightRadius = 999;
            this.propLightRadius = 999;
        });

        // Add bounding box toggle
        InputHandler.subscribe(["b"], () => {
            if (!hasDebugModifier()) return;

            Entity.displayBoundingBox = !Entity.displayBoundingBox;
        });

        // Show debug text
        InputHandler.subscribe(["c"], () => {
            if (!hasDebugModifier()) return;

            // Enable scene instrumentation
            if (this.sceneInstrumentation === undefined) {
                this.sceneInstrumentation = new BABYLON.SceneInstrumentation(this.scene);
                this.sceneInstrumentation.captureActiveMeshesEvaluationTime = true;
                this.sceneInstrumentation.captureRenderTargetsRenderTime = true;
                this.sceneInstrumentation.captureFrameTime = true;
                this.sceneInstrumentation.captureRenderTime = true;
                this.sceneInstrumentation.captureInterFrameTime = true;
                this.sceneInstrumentation.captureParticlesRenderTime = true;
                this.sceneInstrumentation.captureSpritesRenderTime = true;
                this.sceneInstrumentation.capturePhysicsTime = true;
                this.sceneInstrumentation.captureAnimationsTime = true;
            }

            // Enable engine instrumentation
            if (this.engineInstrumentation === undefined) {
                this.engineInstrumentation = new BABYLON.EngineInstrumentation(this.engine);
                this.engineInstrumentation.captureGPUFrameTime = true;
                this.engineInstrumentation.captureShaderCompilationTime = true;
            }

            // Show debug text
            this.debugText.isVisible = !this.debugText.isVisible;
        });

        // Dump the tree data
        InputHandler.subscribe(["t"], () => hasDebugModifier() && this.connection.tempDumpTree());

        // Update hunter or prop
        InputHandler.subscribe(["-"], () => hasDebugModifier() && this.connection.tempSelectPlayerState("hunter"));
        InputHandler.subscribe(["="], () => hasDebugModifier() && this.connection.tempSelectPlayerState("prop"));

        // Add debug layer
        InputHandler.subscribe([","], () => {
            if (!hasDebugModifier()) return;

            if (this.scene.debugLayer.isVisible()) {
                this.scene.debugLayer.hide();
            } else {
                this.scene.debugLayer.show();
            }
        });

        // Duplicate the object
        InputHandler.subscribe(["o"], () => hasDebugModifier() && this.connection.tempDuplicateObject());

        // Spawn all props
        InputHandler.subscribe(["i"], () => hasDebugModifier() && this.connection.tempSpawnAllProps());

        // Round the player's position
        InputHandler.subscribe(["r"], () => hasDebugModifier() && this.connection.tempRoundPosition());
    }

    private resize() {
        this.engine.setSize(window.innerWidth, window.innerHeight);
    }

    private begin() {
        // Connect to the socket
        this.connection.connect();

        // Start the render loop
        this.engine.runRenderLoop(() => {
            // Calculate the delta time
            let dt: float;
            let now = Date.now();
            if (this.previousUpdate === -1) {
                dt = 0;
            } else {
                dt = now - this.previousUpdate
            }
            this.previousUpdate = now; // Save time for next frame
            dt /= 1000; // Convert to seconds

            // Call the update function
            this.update(dt);

            // Update the GUI
            this.updateGUI(dt);

            // Render the scene
            this.scene.render();
        });
    }

    /* State */
    public updateState() {
        // Update pointer lock
        switch (this.gameState) {
            case GameState.Playing:
                // Do nothing
                break;
            default:
                // Exit the pointer lock
                document.exitPointerLock();
                break;
        }

        // Update ad
        // const adElement = document.getElementById("makeMeSomeMoney");
        switch (this.gameState) {
            case GameState.Menu:
                // Update the ad
                // adElement.style.display = "block";

                // Refresh the ad
                // (window as any).refereshAd();

                break;
            default:
                // Make sure the ad is hidden
                // adElement.style.display = "none";

                break;
        }

        // Update GUI
        let menuGUIShowing: boolean;
        let gameGUIShowing: boolean;
        let disconnectGUIShowing: boolean
        switch (this.gameState) {
            case GameState.Disconnected:
                menuGUIShowing = false;
                gameGUIShowing = false;
                disconnectGUIShowing = true;
                break;
            case GameState.Menu:
                menuGUIShowing = true;
                gameGUIShowing = false;
                disconnectGUIShowing = false;
                break;
            case GameState.Playing:
            case GameState.Spectating:
                menuGUIShowing = false;
                gameGUIShowing = true;
                disconnectGUIShowing = false;
                break;
            default:
                console.error("Unknown game state", this.gameState);
                break;
        }

        // Apply the state
        this.menuGUI.isVisible = menuGUIShowing;
        this.gameGUI.isVisible = gameGUIShowing;
        this.disconnectGUI.isVisible = disconnectGUIShowing;
    }

    public updateServerState() {
        // Play the necessary sound if needed
        let sound: BABYLON.Sound | undefined;
        switch (this.gameServerState) { // TODO: Fanfare for finishing the round
            case GameServerState.Hunting:
                sound = Assets.huntingStartHorn;
                break;
            default:
                break;
        }
        if (sound) {
            sound.spatialSound = false;
            sound.play();
        }

        // Update the GUI
        this.gameGUI.updateGameServerState(this.gameServerState);
    }

    /* Input */
    /// Rotate the player by a certain amount.
    private rotateBy(rot: int) {
        const mainPlayer = this.mainPlayer;
        const newRotation = Math.mod(this.mainPlayer.serverRotation + rot, 4) as EntityRotation;
        mainPlayer.serverRotation = newRotation;
        this.connection.sendRotate(newRotation);
    }

    private switchObject(x: float, y: float) {
        // Pick the object
        const pickInfo = this.scene.pick(x, y, m => {
            // Make sure it's a bounding box
            if (m.name != NodeNames.BOUNDING_BOX)
                return false;

            // Make sure the entity is selectable
            const entityId = Utils.entityIdFromChildNode(m);
            const entity = this.entityForId(entityId);

            return !(entity == undefined || !entity.selectable);
        }, false, this.camera);

        // Handle the hit
        if (pickInfo.hit) {
            // Show the mesh was picked
            const mesh = pickInfo.pickedMesh;
            // (mesh.material as BABYLON.StandardMaterial).diffuseColor.set(Math.random(), Math.random(), Math.random());

            // Find the entity ID
            const entityId = Utils.entityIdFromChildNode(mesh);
            Game.shared.connection.sendSelect(entityId);
            // console.log("Picked entity", entityId, Game.shared.entityForId(entityId));
        } else {
            // console.log("No mesh hit");
        }
    }

    private shootAt(x: float, y: float) {
        // Pick from he bounding boxes
        const pickInfo = this.scene.pick(
            x, y,
            m => {
                // Validate the name
                if (m.name !== NodeNames.BOUNDING_BOX || !m.isEnabled(true)) return false;

                // Validate that the entity is shootable
                const entityId = Utils.entityIdFromChildNode(m);
                const entity = this.entityForId(entityId);
                if (entity === undefined) {
                    console.error("Failed to find entity for id ", entityId);
                    return false;
                } else if (!entity.isShootable) {
                    return false;
                }

                // It's OK to shoot
                return true;
            },
            false, this.camera);

        // Handle the hit
        if (pickInfo.hit) {
            // Find the point that was hit
            const pickedPoint = pickInfo.pickedPoint;
            pickedPoint.z *= -1; // Invert the z position so it aligns with proper coordinates

            // Send that to the server
            this.connection.sendShoot(pickedPoint);
        } else {
            console.log("No mesh shot");
        }
    }

    private updateMousePos(point: PointerEvent) {
        // Update the position
        this.mouseX = point.clientX;
        this.mouseY = point.clientY;
    }

    public updateMoveDir() {
        if (!this.isPlaying) return;

        // Calculate movement direction
        let x: float = 0;
        let y: float = 0;
        if (InputHandler.key("w", "up")) y += 1;
        if (InputHandler.key("s", "down")) y -= 1;
        if (InputHandler.key("a", "left")) x -= 1;
        if (InputHandler.key("d", "right")) x += 1;

        // Calculate movement direction
        let moveDir: float;
        if (x != 0 || y != 0) {
            moveDir = Math.atan2(y, x) + this.aimDir + Math.PI;
        } else {
            moveDir = undefined;
        }

        // Determine if sprinting
        const sprinting = InputHandler.key("shift");

        // Send the input
        if (moveDir === undefined || this.moveDir === undefined || Math.abs(moveDir - this.moveDir) > Math.PI * 0.02 || sprinting !== this.sprinting) {
            this.moveDir = moveDir;
            this.sprinting = sprinting;
            this.connection.sendMove(this.moveDir, this.sprinting);
        }
    }

    /* Update */
    public update(dt: float) {
        // Remove entities
        for (let id in this.entities) {
            let entity = this.entityForId(id);

            // Remove the entity if needed
            if (entity.state == EntityState.PendingDestroy) {
                // Remove the entity
                entity.state = EntityState.Destroyed;
                delete this.entities[id];

                // Release the entity
                this.releaseEntity(entity);
            }
        }

        // Update the entities
        for (let id in this.entities) {
            let entity = this.entityForId(id);
            entity.update(dt);
        }

        // Update the spot light holders
        const spotLightHolders = this.worldNode
            .getDescendants(false, n => n instanceof SpotLightPlaceholder)
            .sort((a: BABYLON.TransformNode, b: BABYLON.TransformNode) => {
                return BABYLON.Vector3.Distance(a.getAbsolutePosition(), this.cameraCenter) - BABYLON.Vector3.Distance(b.getAbsolutePosition(), this.cameraCenter);
            });
        for (let i = 0; i < this.spotLights.length; i++) {
            const light = this.spotLights[i].light;
            if (i < spotLightHolders.length) {
                const holder = (spotLightHolders[i] as SpotLightPlaceholder);
                const worldTransform = holder.getWorldMatrix();
                const tmpVector = BABYLON.Tmp.Vector3[0];

                // Apply transformed position
                tmpVector.set(0, 0, 0);
                BABYLON.Vector3.TransformCoordinatesToRef(tmpVector, worldTransform, light.position);

                // Apply transformed direction
                tmpVector.copyFrom(holder.direction);
                BABYLON.Vector3.TransformNormalToRef(tmpVector, worldTransform, light.direction);

                // Copy the light values
                light.angle = holder.angle;
                light.intensity = holder.intensity;
                light.exponent = holder.exponent;
                light.diffuse.copyFrom(holder.diffuse);
                light.specular.copyFrom(holder.specular);
            } else {
                // Reset the light
                light.angle = 0;
                light.intensity = 0;
                light.exponent = 0;
            }
        }

        // Update the camera and minimap distance
        const isSprinting = this.sprinting && this.stamina > 0;
        this.camera.radius = Math.lerp(
            this.camera.radius,
            isSprinting ? this.cameraDistanceFar : this.cameraDistanceClose,
            2.5 * dt
        );
        this.camera.fov = Math.lerp(
            this.camera.fov,
            isSprinting ? this.cameraFovFar : this.cameraFovClose,
            2.5 * dt
        );
        this.gameGUI.minimap.mapScale = Math.lerp(
            this.gameGUI.minimap.mapScale,
            isSprinting ? Minimap.minimapScaleFar : Minimap.minimapScaleClose,
            2.5 * dt
        );

        // Move the camera
        let spectatingEntity = this.spectating;
        if (spectatingEntity) {
            // Move the spectating light to the entity
            this.spectatingLight.intensity = 1.5;
            this.spectatingLight.position.copyFrom(spectatingEntity.node.position);
            this.spectatingLight.position.z += 20;

            // Update the radius of the spectating light
            const spectatingLightRangeFlicker = (Math.sin(Date.now() / 1000 * 0.8) * 0.08 + 1); // + (Math.random() * 0.1);
            const targetSpectatingLightRange = spectatingEntity.isHunter ? this.hunterLightRadius : this.propLightRadius;
            this.currentSpectatingLightRange = Math.lerp(
                this.currentSpectatingLightRange,
                targetSpectatingLightRange,
                this.spectatingLightRangeLerpSpeed * dt
            );
            this.spectatingLight.range = this.currentSpectatingLightRange * spectatingLightRangeFlicker;

            // Move the camera center
            this.cameraCenter.set(
                spectatingEntity.node.position.x,
                spectatingEntity.node.position.y,
                -spectatingEntity.node.position.z - this.cameraHeight
            );

            // Update the minimap
            this.gameGUI.minimap.playerVisible = true;
            this.gameGUI.minimap.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            this.gameGUI.minimap.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
            this.gameGUI.minimap.updatePlayerPosition(spectatingEntity.node.position.x, spectatingEntity.node.position.y, this.aimDir);
        } else {
            // Hide the spectating light
            this.spectatingLight.intensity = 0;

            // Hide minimap dot
            this.gameGUI.minimap.playerVisible = false;
        }

        // Update the camera
        this.camera.alpha = this.cameraAlphaBase + this.aimDir + Math.PI;
        this.camera.beta = this.cameraBetaBase - this.verticalAimDir;
        this.cameraParent.position.copyFrom(this.cameraCenter);
    }

    private updateGUI(dt: float) {
        // Update game
        this.gameGUI.update(dt);

        // Update entity labels
        for (let entityId in this.entityLabels) {
            this.entityLabels[entityId].update(dt);
        }

        // Update the debug text
        this.updateDebugText();

        // Update the ping delay
        if (this.pingStart) {
            this.gameGUI.pingTimer.progress = 1 - (Date.now() - this.pingStart) / this.pingDelay;
        }
        if (this.shootStart) {
            this.gameGUI.shootTimer.progress = (Date.now() - this.shootStart) / this.shootDelay;
        }
        this.gameGUI.staminaBar.progress = Math.lerp(this.gameGUI.staminaBar.progress, this.stamina, dt * 3);
    }

    /* Event management */
    public handleClientEvent(event: ClientEvent) {
        // Extract the flag
        const flag = event[0];

        // Handle the event
        const data = event[1];
        switch (flag) {
            case ClientEventFlag.GameState:
                // This is never used, we just send the state with every update
                this.gameServerState = data;
                break;
            case ClientEventFlag.Shoot:
                let [shooterId, startRaw, endRaw] = data;
                const start = Utils.arrayToVector(startRaw);
                const end = Utils.arrayToVector(endRaw);
                const distance = BABYLON.Vector3.Distance(start, end);

                /* Sound */
                // Shoot sound
                let shootSound: BABYLON.Sound;
                if (shooterId == Game.shared.mainPlayerId || shooterId == Game.shared.spectatingId) {
                    shootSound = Assets.shootMainPlayer;
                } else {
                    shootSound = Assets.shootOtherPlayer;
                }
                shootSound.setPosition(start);
                shootSound.play();

                // Hit sound; delay the sound the further away the bullet is
                let hitSound = Assets.bulletHit;
                hitSound.setPosition(end);
                hitSound.play(distance / 1000);

                /* Trail */
                // Add a trail mesh
                const diameter = 2.5;
                const mesh = BABYLON.Mesh.CreateCylinder("Shoot Trail", 1.0, diameter, diameter, 3, this.scene);
                mesh.parent = this.worldNode;

                // Calculate the rotation
                const axis1 = end.subtract(start);
                axis1.normalize();
                const axis2 = BABYLON.Vector3.Cross(axis1, BABYLON.Vector3.Up());
                axis2.normalize();
                const axis3 = BABYLON.Vector3.Cross(axis2, axis1);
                axis3.normalize();
                mesh.rotation = BABYLON.Vector3.RotationFromAxis(axis2, axis1, axis3);

                // Configure the material
                mesh.material = this.sharedBulletMaterial;

                // Calculate the animation speed from the bullet speed; this value is used in the speed ratio, since the
                // base animation length is 1s.
                const bulletSpeed = 500; // units/s
                const animationLength = distance / bulletSpeed;

                // Shrink the trail // TODO: Reuse animation
                const frameRate = 30;
                const length = frameRate; // 1 second
                const disappear = new BABYLON.Animation("Disappear", "scaling", frameRate, BABYLON.Animation.ANIMATIONTYPE_VECTOR3);
                disappear.setKeys([
                    { frame: 0, value: new BABYLON.Vector3(1, distance, 1) },
                    { frame: length, value: new BABYLON.Vector3(0, 0, 0) }
                ]);
                const moveToEnd = new BABYLON.Animation("Move", "position", frameRate, BABYLON.Animation.ANIMATIONTYPE_VECTOR3);
                moveToEnd.setKeys([
                    { frame: 0, value: new BABYLON.Vector3((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2) },
                    { frame: length, value: end.clone() }
                ]);
                this.scene.beginDirectAnimation(mesh, [disappear, moveToEnd], 0, length, false, 1 / animationLength, () => mesh.dispose());

                /* Light flash */
                // Find a flash
                const flash = this.shootFlashes[this.shootFlashIndex++ % this.shootFlashes.length];
                flash.position.copyFrom(start);
                this.scene.beginAnimation(flash, 0, flash.animations[0].getKeys()[1].frame, false);

                break;
            case ClientEventFlag.Ping:
                const point = data;

                // Play a sound
                const pingSound = Assets.randomPingSound;
                pingSound.setPosition(new BABYLON.Vector3(point[0], point[1], 0));
                pingSound.play();

                // Add ping to the minimap
                this.gameGUI.minimap.ping(point[0], point[1]);

                break;
            case ClientEventFlag.PlayerDeath:
                // Play a sound
                const deathSound = Assets.playerDeath;
                deathSound.spatialSound = false;
                deathSound.play();

                break;
            case ClientEventFlag.ScoreboardUpdate:
                // Display the new scoreboard
                this.gameGUI.scoreboard.displayData(data);

                break;
            default:
                console.warn("Unknown event flag", flag);
        }
    }

    /* Entity management */
    public addEntity(data: EntityData) {
        // console.log("Add entity", data);

        // Destruct the data
        let id = data[EPF.Id] as int;

        // Make sure an entity doesn't already exist
        if (this.entities[id]) {
            console.error(`Entity with id ${id} already exists.`);
            return;
        }

        // Create the entity
        let entity = this.allocateEntity();
        entity.initEntity(data);
        entity.node.parent = this.worldNode;

        // Add to the map
        this.entities[id] = entity;
    }

    private allocateEntity(): Entity {
        // Try to find an available entity in pool
        if (this.entityPool.length > 0) {
            return this.entityPool.pop();
        }

        // Otherwise, create a new entity
        return new Entity();
    }

    private releaseEntity(entity: Entity) {
        // Reset the entity
        entity.reset();

        // Save to pool
        this.entityPool.push(entity);
    }

    public updateEntity(data: EntityData) {
        // console.log("Update entity", data);

        // Update the entity
        this.entityForId(data[0]).updateEntity(data, false);
    }

    public removeEntity(id: int, animated: boolean) {
        // console.log("Remove entity", id, animated);

        // Destroy the entity
        let entity = this.entityForId(id);
        entity.destroyEntity(animated);

        // Remove spectating or main player if needed
        if (id == this.mainPlayerId) {
            this.mainPlayerId = undefined;
        }
        if (id == this.spectatingId) {
            this.spectatingId = undefined;
        }
    }

    public entityForId(id: int | string): Entity | undefined {
        let entity = this.entities[id];
        if (entity) {
            return entity;
        } else {
            return undefined;
        }
    }

    /* GUI */
    public updateEntityLabel(entity: Entity) {
        // Find existing label
        let label = this.entityLabels[entity.id];

        // Create new label if needed; otherwise update it
        const entityId = entity.id; // Copy the entity id for later
        if (label == undefined) {
            label = new EntityLabel(entity);
            this.entityLabels[entityId] = label;

            this.uiTexture.addControl(label);

            label.linkWithMesh(entity.labelHandle);

            // Remove label when entity destroyed
            entity.node.onDisposeObservable.add(() => {
                delete this.entityLabels[entityId];
                label.dispose();
            });
        } else {
            label.updateLabel();
        }
    }

    public removeEntityLabel(id: EntityId) {
        // Dispose the label if exists
        const label = this.entityLabels[id];
        if (label !== undefined) {
            delete this.entityLabels[id];
            label.dispose();
        }
    }

    public setPingDelay(delay: float | undefined) {
        // Show the timer
        this.gameGUI.pingTimer.isVisible = delay != undefined;

        // Save the ping data
        this.pingStart = Date.now();
        this.pingDelay = delay;
    }

    public setShootDelay(delay: float | undefined) {
        // Show the timer
        this.gameGUI.shootTimer.isVisible = delay != undefined;

        // Save the ping data
        this.shootStart = Date.now();
        this.shootDelay = delay;
    }

    public setStamina(stamina: float) {
        this.stamina = stamina;
    }

    /* Debug */
    private updateDebugText() {
        if (!this.debugText.isVisible) return;

        function shorten(num: number): string {
            return (Math.round(num * 100) / 100).toString();
        }
        function stringifyVector(vector: BABYLON.Vector3): string {
            return `[${shorten(vector.x)},${shorten(vector.y)},${shorten(vector.z)}]`;
        }
        function stringifyEntity(entity: Entity, indentCount: number) {
            const indentChar = "  ";
            const indent = indentChar.repeat(indentCount + 1);

            return `${indentChar.repeat(indentCount)} Entity: ${entity.id} (${entity.state})\n` +
                `${indent}Asset: ${entity.assetName}\n` +
                `${indent}Selectable: ${entity.selectable}\n` +
                `${indent}Position: ${stringifyVector(entity.serverPosition)}\n` +
                `${indent}Velocity: ${stringifyVector(entity.serverVelocity)}\n` +
                `${indent}Rotation: ${shorten(entity.serverRotation)}\n` +
                `${indent}Dir: ${shorten(entity.serverDir)}\n` +
                `${indent}Using dir: ${entity.usesDir}\n`;
        }
        function formatTime(time: number) {
            return time.toFixed(2) + " ms";
        }

        let text = "";

        // Basic stats
        text += `BABYLON Engine Version: v${BABYLON.Engine.Version}\n`;
        text += `FPS: ${Math.round(this.engine.getFps())}\n`;
        text += "\n";

        // Scene stats
        const si = this.sceneInstrumentation;
        text +=
            `Total meshes: ${this.scene.meshes.length}\n` +
            `Draw calls: ${si.drawCallsCounter.current}\n` +
            `Texture collisions: ${si.textureCollisionsCounter.current}\n` +
            `Total lights: ${this.scene.lights.length}\n` +
            `Total vertices: ${this.scene.getTotalVertices()}\n` +
            `Total materials: ${this.scene.materials.length}\n` +
            `Total textures: ${this.scene.textures.length}\n` +
            `Active meshes: ${this.scene.getActiveMeshes().length}\n` +
            `Active indices: ${this.scene.getActiveIndices()}\n` +
            `Active bones: ${this.scene.getActiveBones()}\n` +
            `Active particles: ${this.scene.getActiveParticles()}\n` +
            `\n`;

        // Timing
        text +=
            `Meshes selection: ${formatTime(si.activeMeshesEvaluationTimeCounter.current)}\n` +
            `Render targets: ${formatTime(si.renderTargetsRenderTimeCounter.current)}\n` +
            `Particles: ${formatTime(si.particlesRenderTimeCounter.current)}\n` +
            `Sprites: ${formatTime(si.spritesRenderTimeCounter.current)}\n` +
            `Animations: ${formatTime(si.animationsTimeCounter.current)}\n` +
            `Physics: ${formatTime(si.physicsTimeCounter.current)}\n` +
            `Render: ${formatTime(si.renderTimeCounter.current)}\n` +
            `Frame: ${formatTime(si.frameTimeCounter.current)}\n` +
            `Inter-frame: ${formatTime(si.interFrameTimeCounter.current)}\n` +
            `Potential FPS: ${Math.round(1000 / si.frameTimeCounter.current)}\n` +
            `Resolution: ${this.engine.getRenderWidth() + "x" + this.engine.getRenderHeight()}\n` +
            `\n`;

        // Engine stats
        const ei = this.engineInstrumentation;
        text +=
            `Current frame time (GPU): ${formatTime(ei.gpuFrameTimeCounter.current * 0.000001)}\n` +
            `Average frame time (GPU): ${formatTime(ei.gpuFrameTimeCounter.average * 0.000001)}\n` +
            `Total shader compilation time: ${formatTime(ei.shaderCompilationTimeCounter.total)}\n` +
            `Average shader compilation time: ${formatTime(ei.shaderCompilationTimeCounter.average)}\n` +
            `Total shaders compiled: ${ei.shaderCompilationTimeCounter.count}\n` +
            `Cached effects: ${Object.keys((this.engine as any)._compiledEffects).length}\n` +
            `\n`;

        // Spectating
        const spectatingEntity = this.spectating;
        text += "Spectating entity:\n";
        if (spectatingEntity) {
            text += stringifyEntity(spectatingEntity, 1);
        }
        text += "\n";

        // Game stats
        let entityCount = 0;
        for (let key in this.entities) {
            entityCount++;
        }
        text += `Entity count: ${entityCount}\n`;
        text += "\n";

        // Apply to text
        this.debugText.text = text;
    }
}
