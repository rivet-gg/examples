import {float, int} from "./types";
import {VectorArray, Utils, NodeNames, RectArray} from "./Utils";
import {Game} from "./Game";
import * as BABYLON from "babylonjs";
import {EmissionPlatform, PlatformParticleSystem, PlatformParticleSystemConfig} from "./PlatformParticleSystem";
import {Assets} from "./Assets";
import {SpotLightPlaceholder} from "./SpotLightPlaceholder";

/* Pack data */
export type EntityId = int;
export type EntityRotation = 0 | 1 | 2 | 3; // 0º, 90º, 180º, or 270º
export enum EntityPackFlags {
    Id = 0, // int
    Position = 1, // VectorArray
    Velocity = 2, // VectorArray
    Rotation = 3, // EntityRotation
    Dir = 4, // float
    UsesDir = 8, // boolean
    Health = 11,
    Asset = 5, // string
    Label = 6, // string
    BodyRect = 7, // [VectorArray, VectorArray][]
    Selectable = 9, // bool
    Sleeping = 10 // bool
}
export const EPF = EntityPackFlags;
export type EntityData = {[key: number]: any};

/* State */
export enum EntityState {
    // Waiting for `init` to be called
    PendingInit,

    // `init` has been called
    Alive,

    // Destroying with an animation
    DestroyingAnimated,

    // Waiting to be removed
    PendingDestroy,

    // Removed
    Destroyed
}

/* Entity */
export class Entity {
    // Settings
    protected static smoothMovement = true;

    private static _displayBoundingBox = false;
    public static get displayBoundingBox(): boolean { return this._displayBoundingBox; }
    public static set displayBoundingBox(display: boolean) {
        // Save the value
        this._displayBoundingBox = display;

        // Turn off the boxes for all entities
        for (let entityId in Game.shared.entities) {
            const entity = Game.shared.entities[entityId];
            for (let box of entity.boundingBoxes) {
                (box as BABYLON.AbstractMesh).isVisible = display;
            }
        }
    }

    // Node
    public node: BABYLON.TransformNode; // The base node; this node is in charge of moving the translation
    public rotNode: BABYLON.TransformNode; // A child node of `node`; this rotates with the rotation (fixed at 90º intervals)
    public dirNode: BABYLON.TransformNode; // A child node of `node`; this rotates with the direction
    public labelHandle: BABYLON.AbstractMesh; // The empty mesh that the usernmae node will pin to
    private meshes: BABYLON.AbstractMesh[] = [];
    public get assetParent(): BABYLON.TransformNode { return this.usesDir ? this.dirNode : this.rotNode; }
    public get boundingBoxes(): BABYLON.AbstractMesh[] {
        return this.rotNode.getChildren(n => n.name == NodeNames.BOUNDING_BOX) as BABYLON.AbstractMesh[];
    }

    // Basic properties
    public state: EntityState;
    public id: int;

    // Values sent from the server
    public assetName: string;
    public selectable: boolean; // If the entity can be switched to as a prop; only sent if the player is a prop
    public usesDir: boolean; // If the entity rotates using the sent dir
    public serverPosition: BABYLON.Vector3 = BABYLON.Vector3.Zero();
    public serverVelocity: BABYLON.Vector3 = BABYLON.Vector3.Zero();
    public serverDir: float;
    public serverRotation: EntityRotation;
    public health: float;
    public label: string;

    // Steps
    public static stepInterval: float = 15; // How much the player has to walk between foot steps
    public distanceWalked: float; // How much the player has moved
    public lastStepDistance: float; // The distance at which the last step was played

    // Other parameters
    public autoPosition: boolean = true; // If the entity should automatically move to the given pos
    public get isHunter(): boolean { return this.assetName.startsWith("player-"); }
    public get isShootable(): boolean { return this.assetName !== "boundary" && this.id !== Game.shared.mainPlayerId; }

    public constructor() {
        // Add a base node in which children will be added
        this.node = new BABYLON.TransformNode("<CREATING ENTITY>");

        // Add a node for the rotation
        this.rotNode = new BABYLON.TransformNode(NodeNames.ROTATION_NODE);
        this.rotNode.parent = this.node;

        // Add a node for the rotation
        this.dirNode = new BABYLON.TransformNode(NodeNames.DIRECTION_NODE);
        this.dirNode.parent = this.node;

        // Add label handle
        this.labelHandle = new BABYLON.Mesh("Label Handle", Game.shared.scene);
        this.labelHandle.parent = this.node;

        // Reset the entity to initial state
        this.reset();
    }

    public reset() {
        const oldId = this.id;

        this.id = -1;
        this.state = EntityState.PendingInit;

        this.assetName = "";
        this.selectable = false;
        this.usesDir = false;
        this.serverPosition.set(0, 0, 0);
        this.serverVelocity.set(0, 0, 0);
        this.serverDir = 0;
        this.serverRotation = 0;
        this.health = 1.0;
        this.label = "";

        this.distanceWalked = 0;
        this.lastStepDistance = 0;

        this.node.name = "<RESET ENTITY>";
        this.node.parent = undefined;
        this.node.setEnabled(false);
        this.node.position.set(0, 0, 0);
        this.dirNode.rotation.set(0, 0, 0);
        this.rotNode.rotation.set(0, 0, 0);

        this.meshes = [];
        Utils.clearChildren(this.dirNode);
        Utils.clearChildren(this.rotNode);

        Game.shared.removeEntityLabel(oldId);
    }

    /// Called when inserted into the scene. Do not override.
    public initEntity(data: EntityData) {
        // Save the id
        this.id = data[EPF.Id];
        this.node.name = NodeNames.generateEntityNodeName(this.id);
        this.node.setEnabled(true);

        // Set the actual positions automatically on init
        if (this.autoPosition) {
            // Set position
            const position = data[EPF.Position];
            this.node.position.set(position[0], position[1], position[2]);

            // Set direction
            this.setDir(data[EPF.Dir] as float);

            // Set rotation;
            this.setRot(data[EPF.Rotation] * Math.PI / 2);
        }

        // Update the state
        this.state = EntityState.Alive;

        // Update the data
        this.updateEntity(data, true);
    }

    /// Called when new data about the entity is received.
    public updateEntity(data: EntityData, initData: boolean) {
        // Destruct the data
        let labelChanged = false;
        if (data[EPF.Position] != undefined)
            this.serverPosition.setFromArray(data[EPF.Position] as VectorArray);
        if (data[EPF.Velocity] != undefined) {
            // Check if jumped
            const jumpThreshold = 50;
            const newZVel = data[EPF.Velocity][2];
            if (newZVel > 0 && newZVel - this.serverVelocity.z >= jumpThreshold) {
                const sound = Assets.jump;
                sound.setPosition(this.node.position);
                sound.play();
            }

            // Save velocity
            this.serverVelocity.setFromArray(data[EPF.Velocity] as VectorArray);
        }
        if (data[EPF.Rotation] != undefined)
            this.serverRotation = data[EPF.Rotation] as EntityRotation;
        if (data[EPF.Dir] != undefined)
            this.serverDir = data[EPF.Dir] as float;
        if (data[EPF.UsesDir] != undefined)
            this.usesDir = data[EPF.UsesDir] as boolean;
        if (data[EPF.Health] != undefined) {
            this.health = data[EPF.Health];
            labelChanged = true;
            if (!initData && this.health > 0) {
                this.popAnimation();
            }
        }
        if (data[EPF.Asset] != undefined) {
            this.setAsset(data[EPF.Asset]);
            labelChanged = true; // Need to redraw the health
        }
        if (data[EPF.Label] != undefined) {
            this.label = data[EPF.Label];
            labelChanged = true;
        }
        if (data[EPF.BodyRect] != undefined) {
            // Remove all other bounding boxes
            for (let oldBox of this.boundingBoxes) {
                oldBox.dispose();
            }

            // Add new boxes
            let maxHeight = 0;
            for (let rect of data[EPF.BodyRect] as RectArray[]) {
                const center = rect[0];
                const size = rect[1];

                // Set new max height
                const height = center[2] + size[2] / 2;
                if (height > maxHeight) {
                    maxHeight = height;
                }

                // Add a body rectangle, also used for hit testing entities
                let bodyRect = BABYLON.MeshBuilder.CreateBox(NodeNames.BOUNDING_BOX, {
                    width: 1, height: 1, depth: 1
                }, Game.shared.scene);
                bodyRect.position.setFromArray(center);
                bodyRect.scaling.setFromArray(size);
                bodyRect.isVisible = Entity.displayBoundingBox; // Don't render if not debugging
                bodyRect.parent = this.rotNode;
            }

            // Set the username at the max height of the body
            this.labelHandle.position.z = maxHeight + 10;
        }
        if (data[EPF.Selectable] != undefined)
            this.selectable = data[EPF.Selectable];
        if (data[EPF.Sleeping] != undefined) {
            for (let box of this.boundingBoxes) {
                box.material = data[EPF.Sleeping] ? Game.shared.sharedSleepingBoundingBox : Game.shared.sharedAwakeBoundingBox;
            }
        }

        // Update label if needed
        if (labelChanged) {
            Game.shared.updateEntityLabel(this);
        }
    }

    /// Called when destroyed.
    public destroyEntity(animated: boolean) {
        if (animated) {
            // Update state and animate the destroy
            this.state = EntityState.DestroyingAnimated;
            this.animateDestroy();
        } else {
            this.finishDestroy();
        }
    }

    /// Starts an animation for destroying the object.
    public animateDestroy() {
        const fps = 30;
        const length = 0.2;
        BABYLON.Animation.CreateAndStartAnimation(
            "Destroy Animation",
            this.node,
            "scaling",
            fps,
            fps * length,
            BABYLON.Vector3.One(),
            BABYLON.Vector3.Zero(),
            BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT,
            undefined,
            () => this.finishDestroy()
        );
    }

    public finishDestroy() {
        // Update state
        this.state = EntityState.PendingDestroy;
    }

    /// Called every frame.
    public update(dt: float) {
        // Update position and angle if needed
        if (this.autoPosition) {
            // Update the entity's position
            let targetRotation = this.serverRotation * Math.PI / 2;
            if (Entity.smoothMovement) {
                const time = 8 * dt;
                this.node.position.lerp(this.serverPosition, time);
                if (this.id !== Game.shared.mainPlayerId) { // Don't send if the main player controls the aim dir
                    this.setDir(Math.slerp(this.dirNode.rotation.z, this.serverDir, time));
                }
                this.setRot(Math.slerp(this.rotNode.rotation.z, targetRotation, time));
            } else {
                this.node.position.copyFrom(this.serverPosition);
                if (this.id !== Game.shared.mainPlayerId) { // Don't send if the main player controls the aim dir
                    this.setDir(this.serverDir);
                }
                this.setRot(targetRotation);
            }
        }

        // Add to total distance walked based on velocity
        this.distanceWalked += Math.sqrt(Math.pow(this.serverVelocity.x, 2) + Math.pow(this.serverVelocity.y, 2)) * dt;
        if (this.isHunter && this.distanceWalked > this.lastStepDistance + Entity.stepInterval) {
            // Play the sound
            const sound = Assets.randomStepSound;
            sound.setVolume(0.6);
            sound.setPosition(this.node.position);
            sound.play();

            // Save the distance
            this.lastStepDistance = this.distanceWalked;
        }
    }

    /// Updates the asset for the object.
    public setAsset(asset: string) {
        // Don't do duplicate assets
        if (asset == this.assetName)
            return;
        const initialAsset = !this.assetName;

        // Save the asset
        this.assetName = asset;

        // Play a sound if the main player
        if (!initialAsset && !this.isHunter) {
            const sound = Assets.switchProp;
            sound.setPosition(this.node.position);
            sound.play();
        }

        // Remove all old nodes that aren't debug assets
        Utils.clearChildren(this.dirNode);
        Utils.clearChildren(this.rotNode);

        // If the node is being spectated
        const spectatingEntity = Game.shared.spectatingId == this.id;

        // Add new assets
        if (asset.length == 0) {
            // Empty node
        } else if (asset == "ground") {
            // Configure the grass
            const groundSize = Math.pow(2, 16);
            const groundTextureSize = 32;
            const voxelsPerPixel = 8;
            const groundTextureScaling = groundSize / groundTextureSize / voxelsPerPixel;

            // Create the meshes
            let grassBase = BABYLON.MeshBuilder.CreatePlane("Grass Base", {
                width: groundSize,
                height: groundSize
            }, Game.shared.scene);
            grassBase.position.z -= 1; // Put it right below so it doesn't cause rendering issues
            grassBase.scaling.z = -1; // Want to show the back side of the grass so the light shines properly

            let grassTop = BABYLON.MeshBuilder.CreatePlane("Grass Top", {
                width: groundSize,
                height: groundSize
            }, Game.shared.scene);
            grassTop.position.z -= 0.75;
            grassTop.scaling.z = -1;

            // Create the texture
            const baseTexture = Assets.grassBaseTexture;
            const topTexture = Assets.grassTopTexture;
            topTexture.hasAlpha = true;
            baseTexture.uScale = baseTexture.vScale = groundTextureScaling;
            topTexture.uScale = topTexture.vScale = groundTextureScaling;

            // Create base material
            let baseMaterial = new BABYLON.StandardMaterial("Grass Base", Game.shared.scene);
            let topMaterial = new BABYLON.StandardMaterial("Grass Top", Game.shared.scene);
            baseMaterial.diffuseTexture = baseTexture;
            topMaterial.diffuseTexture = topTexture;
            baseMaterial.maxSimultaneousLights = topMaterial.maxSimultaneousLights = Game.MAX_SIMULTANEOUS_LIGHTS;
            baseMaterial.specularColor = topMaterial.specularColor = BABYLON.Color3.Black();
            baseMaterial.backFaceCulling = baseMaterial.backFaceCulling = false;
            grassBase.material = baseMaterial;
            grassTop.material = topMaterial;

            this.addMesh(grassBase);
            // this.addMesh(grassTop);
        } else if (asset === "boundary") {
            // Do nothing
        } else if (asset.startsWith("box-")) {
            // Parse the values
            let [xRaw, yRaw, zRaw, widthRaw, heightRaw, depthRaw, colorRaw] = asset.split("-")[1].split(" ");

            // Add the object
            let box = BABYLON.MeshBuilder.CreateBox("Box Shape", {
                width: parseFloat(widthRaw),
                height: parseFloat(heightRaw),
                depth: parseFloat(depthRaw)
            }, Game.shared.scene);
            box.position.set(parseFloat(xRaw), parseFloat(yRaw), parseFloat(zRaw));
            this.addMesh(box);

            // Set the material
            let material = new BABYLON.StandardMaterial("Box Shape Material", Game.shared.scene);
            material.maxSimultaneousLights = Game.MAX_SIMULTANEOUS_LIGHTS;
            material.specularColor = BABYLON.Color3.White().scale(0.15);
            material.diffuseColor = BABYLON.Color3.FromHexString(colorRaw);
            box.material = material;

        } else if (asset.startsWith("video-")) {
            // Parse the values
            let [url, widthRaw, heightRaw] = asset.split("-")[1].split(" ");
            let [width, height] = [parseFloat(widthRaw), parseFloat(heightRaw)];

            // TODO: Sync the location with Date.now()

            // Create the box
            const plane = BABYLON.MeshBuilder.CreatePlane("Video Plane", { width, height }, Game.shared.scene);
            plane.scaling.z = -1;
            plane.rotation.x = Math.PI / 2;
            plane.position.z = parseFloat(heightRaw) / 2;
            this.addMesh(plane);

            // Set the material
            const material = new BABYLON.StandardMaterial("Video Texture", Game.shared.scene);
            material.maxSimultaneousLights = Game.MAX_SIMULTANEOUS_LIGHTS;
            material.backFaceCulling = true;
            if (url == "webcam") {
                // Get the webcam
                BABYLON.VideoTexture.CreateFromWebCam(
                    Game.shared.scene,
                    (videoTexture) => { material.diffuseTexture = videoTexture; },
                    { minWidth: width, maxWidth: width, minHeight: height, maxHeight: height, deviceId: "" }
                );
            } else {
                // Otherwise, get the video at the url
                material.diffuseTexture = new BABYLON.VideoTexture(
                    "Video",
                    url.split(","),
                    Game.shared.scene,
                    true
                );
            }
            material.emissiveColor = new BABYLON.Color3(1, 1, 1);
            plane.material = material;
        } else {
            // Load the mesh
             const mesh = Assets.model(asset, this.assetParent);

             // Set the mesh parameters
             mesh.rotation.set(Math.PI / 2, 0, 0);
             this.addMesh(mesh, false);

             // Add light components
             if (asset.startsWith("player-")) {
                 // Create the flashlight
                 const light = new SpotLightPlaceholder(NodeNames.FLASHLIGHT);
                 if (light != undefined) {
                     light.position.set(5.5, -8.5, 9);
                     light.direction.set(0, -1, 0);
                     light.angle = Math.PI / 2;
                     light.exponent = 30;
                     light.diffuse = Game.shared.lightColor;
                     light.specular = Game.shared.lightColorSpecular;
                     light.intensity = Game.shared.flashlightIntensity;
                     light.parent = this.assetParent;
                 }
             } else if (asset == "nature:street-light") {
                 // Create the light
                 const light = new SpotLightPlaceholder("Street Light");
                 light.position.set(0, 16, 58);
                 light.direction.set(0, 0, -1);
                 light.angle = Math.PI / 2;
                 light.exponent = 20;
                 light.diffuse.set(1, 1, 1);
                 light.specular.set(1, 1, 1);
                 light.intensity = 5;
                 light.parent = this.assetParent;
             }


             // Change the material if being spectated
             if (spectatingEntity) {
                 mesh.material = Game.shared.sharedGlowingMaterial;
             }
        }

        // Add the particles
        this.addPlatformParticles(asset);
    }

    /// Adds a fountain to the asset.
    private addPlatformParticles(asset: string) {
        // Define attributes for the fountain
        let emitters: EmissionPlatform[] = [];
        let config: PlatformParticleSystemConfig = {
            alpha: 0.6,
            particlesPerEmitter: 15,
            colorMin: new BABYLON.Color3(0.3, 0.6, 0.7),
            colorMax: new BABYLON.Color3(0.3, 0.9, 1.0),
            velocityMin: 13,
            velocityMax: 17,
            scaleMin: 1.25,
            scaleMax: 3,
            gravity: -350
        };
        switch (asset) {
            case "nature:fountain":
                emitters = [
                    // Middle lower platform
                    { emits: false, origin: new BABYLON.Vector3(0, 0, 12), platformSize: new BABYLON.Vector2(68, 68) },

                    // Middle upper platform
                    { emits: false, origin: new BABYLON.Vector3(0, 0, 20), platformSize: new BABYLON.Vector2(76, 4) },
                    { emits: false, origin: new BABYLON.Vector3(0, 0, 20), platformSize: new BABYLON.Vector2(4, 76) },

                    // Upper lower platform
                    { emits: false, origin: new BABYLON.Vector3(0, 0, 70), platformSize: new BABYLON.Vector2(60, 4) },
                    { emits: false, origin: new BABYLON.Vector3(0, 0, 70), platformSize: new BABYLON.Vector2(4, 60) },

                    // Upper upper platform
                    { emits: false, origin: new BABYLON.Vector3(0, 0, 74), platformSize: new BABYLON.Vector2(56, 4) },
                    { emits: false, origin: new BABYLON.Vector3(0, 0, 74), platformSize: new BABYLON.Vector2(4, 56) },

                    // Middle emitters horizontal
                    {
                        emits: true, origin: new BABYLON.Vector3(8, 20, 54),
                        spawnRange: new BABYLON.Vector3(0, 2, 0), direction: new BABYLON.Vector3(1, 0, 0),
                        platformSize: new BABYLON.Vector2(16, 16)
                    },
                    {
                        emits: true, origin: new BABYLON.Vector3(-8, 20, 54),
                        spawnRange: new BABYLON.Vector3(0, 2, 0), direction: new BABYLON.Vector3(-1, 0, 0),
                        platformSize: new BABYLON.Vector2(16, 16)
                    },

                    {
                        emits: true, origin: new BABYLON.Vector3(8, -20, 54),
                        spawnRange: new BABYLON.Vector3(0, 2, 0), direction: new BABYLON.Vector3(1, 0, 0),
                        platformSize: new BABYLON.Vector2(16, 16)
                    },
                    {
                        emits: true, origin: new BABYLON.Vector3(-8, -20, 54),
                        spawnRange: new BABYLON.Vector3(0, 2, 0), direction: new BABYLON.Vector3(-1, 0, 0),
                        platformSize: new BABYLON.Vector2(16, 16)
                    },

                    // Middle emitters vertical
                    {
                        emits: true, origin: new BABYLON.Vector3(20, 8, 54),
                        spawnRange: new BABYLON.Vector3(2, 0, 0), direction: new BABYLON.Vector3(0, 1, 0),
                        platformSize: new BABYLON.Vector2(16, 16)
                    },
                    {
                        emits: true, origin: new BABYLON.Vector3(-20, 8, 54),
                        spawnRange: new BABYLON.Vector3(2, 0, 0), direction: new BABYLON.Vector3(0, 1, 0),
                        platformSize: new BABYLON.Vector2(16, 16)
                    },

                    {
                        emits: true, origin: new BABYLON.Vector3(20, -8, 54),
                        spawnRange: new BABYLON.Vector3(2, 0, 0), direction: new BABYLON.Vector3(0, -1, 0),
                        platformSize: new BABYLON.Vector2(16, 16)
                    },
                    {
                        emits: true, origin: new BABYLON.Vector3(-20, -8, 54),
                        spawnRange: new BABYLON.Vector3(2, 0, 0), direction: new BABYLON.Vector3(0, -1, 0),
                        platformSize: new BABYLON.Vector2(16, 16)
                    },

                    // Upper emitters
                    {
                        emits: true, origin: new BABYLON.Vector3(0, 0, 74),
                        spawnRange: new BABYLON.Vector3(2, 0, 0), direction: new BABYLON.Vector3(0, 1, 0)
                    },
                    {
                        emits: true, origin: new BABYLON.Vector3(0, 0, 74),
                        spawnRange: new BABYLON.Vector3(2, 0, 0), direction: new BABYLON.Vector3(0, -1, 0)
                    },
                    {
                        emits: true, origin: new BABYLON.Vector3(0, 0, 74),
                        spawnRange: new BABYLON.Vector3(0, 2, 0), direction: new BABYLON.Vector3(1, 0, 0)
                    },
                    {
                        emits: true, origin: new BABYLON.Vector3(0, 0, 74),
                        spawnRange: new BABYLON.Vector3(0, 2, 0), direction: new BABYLON.Vector3(-1, 0, 0)
                    },
                ];
                break;
            default:
                // No valid particles
                return;
        }

        // Add the particles
        const system = new PlatformParticleSystem("Platform Particle System", emitters, config, Game.shared.scene);
        system.parent = this.assetParent;
    }

    /// Updates the facing direction
    public setDir(dir: float) {
        this.dirNode.rotation.set(0, 0, dir);
    }

    /// Updates the rotation
    public setRot(rot: float) {
        this.rotNode.rotation.set(0, 0, rot);
    }

    /* Mesh management */
    private addMesh(mesh: BABYLON.AbstractMesh, setParent: boolean = true) {
        // Set the parent
        if (setParent) {
            mesh.parent = this.assetParent;
        }

        // Save it
        this.meshes.push(mesh);

        // Add dispose event to remove it from the array
        mesh.onDisposeObservable.add(() => {
            // If destroying, do nothing
            if (this.state === EntityState.Destroyed || this.state === EntityState.PendingInit) return;

            // Attempt to remove from meshes
            for (let i = 0; i < this.meshes.length; i++) {
                if (this.meshes[i] == mesh) {
                    this.meshes.splice(i, 1);
                    return;
                }
            }

            console.warn("Attempt to remove invalid mesh", mesh);
        });
    }

    /// Triggers a pop animation. This is used when the entity loses health.
    private popAnimation() {
        const frameRate = 30;
        const length = frameRate * 0.2;
        const popAmount = 1.2;
        const pop = new BABYLON.Animation("Pop Animation", "scaling", frameRate, BABYLON.Animation.ANIMATIONTYPE_VECTOR3);
        pop.setKeys([
            { frame: 0, value: new BABYLON.Vector3(1, 1, 1) },
            { frame: length / 2, value: new BABYLON.Vector3(popAmount, popAmount, popAmount) },
            { frame: length, value: new BABYLON.Vector3(1, 1, 1) }
        ]);
        Game.shared.scene.beginDirectAnimation(this.node, [pop], 0, length, false, undefined);
    }
}
