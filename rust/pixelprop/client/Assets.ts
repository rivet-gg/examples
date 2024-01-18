import * as BABYLON from "babylonjs";
import JSZip = require("jszip");
import {Game} from "./Game";

type AssetType = BABYLON.AbstractMesh | BABYLON.StandardMaterial | BABYLON.Texture | BABYLON.Sound | string;

interface AssetLoadingConfig {
    samplingModeOverrides: { [url: string]: number }
}

export class Assets {
    private static get scene(): BABYLON.Scene { return Game.shared.scene; }

    // Constants
    private static DEFAULT_MTL_NAME = "default-material.mtl";
    private static DEFAULT_MTL_TEXTURE_NAME = "default-material.png";
    private static DEFAULT_MTL_STRING = "mtllib default-material.mtl\nusemtl palette"; // Text in the .obj file to omit
    private static DEFAULT_MTL_TEXTURE_STRING = "map_Kd default-material.png"; // Text in the .mtl file to omit

    // Assets to load before everything else; other assets may depend upon these; these are loaded in order, which
    // means that loading these are slower than others, since everything else loads in parallel
    private static PRELOAD_ASSETS = ["models/" + Assets.DEFAULT_MTL_TEXTURE_NAME, "models/" + Assets.DEFAULT_MTL_NAME];

    // Resources
    private static loadConfig: AssetLoadingConfig;
    private static zip: JSZip;
    private static resources: { [url: string]: AssetType } = { };

    /// Download the assets from the server.
    public static loadAssets(config: AssetLoadingConfig): Promise<any> {
        // TODO: Store this zip file and update it every version

        // Save the config
        this.loadConfig = config;

        // Download the ZIP
        return new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", "assets.zip", true);
            xhr.responseType = "arraybuffer";
            xhr.onreadystatechange = () => {
                if (xhr.readyState == XMLHttpRequest.DONE) {
                    this.unpackZIP(xhr.response).then(() => resolve())
                }
            };
            xhr.onerror = (xhr) => {
                console.error("Error downloading ZIP:", xhr);
                reject();
            };
            xhr.send(null);
        });
    }

    /// Unpack the file into data readable by the program.
    private static unpackZIP(data: any): Promise<any> {
        // Unpacks the ZIP
        this.zip = new JSZip();
        return this.zip.loadAsync(data).then(() => this.parseFiles());
    }

    /// Parses teh file into files usable by the game.
    private static parseFiles(): Promise<any> {
        // Determine the files to load
        const files = this.PRELOAD_ASSETS.concat(Object.keys(this.zip.files)); // Load the pre-loaded assets first

        // Load the pre-loaded assets in order so later ones can depend on earlier ones; see this for example:
        // https://gist.github.com/anvk/5602ec398e4fdc521e2bf9940fd90f84; this only really matters for preload files,
        // the rest of the files are still loaded in sequence because parallel won't speed it up that much
        return files.reduce((prevPromise, url) => {
            let file = this.zip.files[url];

            // Make sure the file exists
            if (file == undefined) {
                console.warn("Preload asset at url", url, "does not exist.");
                return Promise.resolve();
            }

            // Make sure it's not a folder
            if (file.dir)
                return Promise.resolve();

            // Make sure the file hasn't been loaded yet
            if (this.resources[url] != undefined)
                return Promise.resolve();

            // Parse the file when ready
            return prevPromise.then(() => this.parseFile(file).then(data => this.resources[url] = data));
        }, Promise.resolve());
    }

    private static parseFile(file: JSZip.JSZipObject): Promise<AssetType> {
        return new Promise((resolve, reject) => {
            // Determine what to do with the file bsaed on the suffix
            const nameComponents = file.name.split(".");
            const suffix = nameComponents[nameComponents.length - 1];
            switch (suffix) {
                case "obj":
                    this.loadObj(file).then(resolve);
                    break;
                case "mtl":
                    this.loadMtl(file).then(resolve);
                    break;
                case "png":
                    this.loadPNG(file).then(resolve);
                    break;
                case "mp3":
                    this.loadMP3(file).then(resolve);
                    break;
                default:
                    console.warn(`Unkown suffix ${suffix} for file ${file.name}.`);
                    file.async("text").then(data => resolve(data));
                    break;
            }
        });
    }

    private static loadObj(file: JSZip.JSZipObject): Promise<AssetType> {
        return new Promise((resolve, reject) => {
            file.async("text").then(data => {
                // Remove default material definitions, since we'll manually apply this material later
                const hasDefaultMtl = data.indexOf(this.DEFAULT_MTL_STRING) != -1;
                if (hasDefaultMtl) {
                    data = data.replace(this.DEFAULT_MTL_STRING, "# removed default material");
                }

                // Load the mesh
                const dataURL = "data:" + data;
                BABYLON.OBJFileLoader.OPTIMIZE_WITH_UV = true; // Fixes the UVs so they don't get glitched
                BABYLON.SceneLoader.ImportMesh("", "", dataURL, this.scene, meshes => {
                    // Validate the mesh count
                    if (meshes.length < 1) {
                        console.error("No meshes in imported mesh:", file.name);
                        reject();
                        return;
                    } else if (meshes.length > 1) {
                        console.warn("More than one mesh in the OBJ file:", file.name);
                    }

                    // Load the mesh
                    const mesh = meshes[0];
                    mesh.isVisible = false; // We don't want it to show in the scene yet

                    // Add default material
                    if (hasDefaultMtl) {
                        mesh.material = this.defaultMaterial;
                    }

                    // Resolve the mesh
                    resolve(meshes[0]);
                }, undefined, undefined, ".obj");
            });
        });
    }

    private static loadMtl(file: JSZip.JSZipObject): Promise<AssetType> {
        return new Promise((resolve, reject) => {
            file.async("text").then(data => {
                const hasDefaultTexture = data.indexOf(this.DEFAULT_MTL_TEXTURE_STRING) != -1;
                if (hasDefaultTexture) {
                    data = data.replace(this.DEFAULT_MTL_TEXTURE_STRING, "# removed default texture");
                }

                // Parse and create materials
                const mtlLoader = new BABYLON.MTLFileLoader();
                const dataURL = "data:" + data;
                mtlLoader.parseMTL(this.scene, dataURL, "");
                const material = mtlLoader.materials[0] as BABYLON.StandardMaterial;

                // Add default texture
                if (hasDefaultTexture) {
                    material.diffuseTexture = this.defaultMaterialTexture;
                }

                // Resolve the material
                resolve(material);
            });
        });
    }

    private static loadPNG(file: JSZip.JSZipObject): Promise<AssetType> {
        return new Promise(resolve => {
            file.async("base64").then(data => {
                const dataUrl = "data:image/png;base64," + data;
                const texture = new BABYLON.Texture(dataUrl, this.scene, undefined, undefined, this.loadConfig.samplingModeOverrides[file.name]);
                resolve(texture);
            });
        });
    }

    private static loadMP3(file: JSZip.JSZipObject): Promise<AssetType> {
        return new Promise(resolve => {
            file.async("arraybuffer").then(data => {
                const sound = new BABYLON.Sound(
                    file.name, data,
                    this.scene,
                    () => resolve(sound),
                    { spatialSound: true, maxDistance: 300 }
                );
            });
        });
    }

    /* General */
    public static getAsset(url: string): AssetType {
        const resource = this.resources[url];
        if (this.resources == undefined)
            throw `Attempting to retrieve non-existent asset at url ${url}.`;
        return resource;
    }

    /* Textures */
    public static get grassBaseTexture(): BABYLON.Texture {
        return this.getAsset("img/grass-base.png") as BABYLON.Texture;
    }

    public static get grassTopTexture(): BABYLON.Texture {
        return this.getAsset("img/grass-top.png") as BABYLON.Texture;
    }

    /* Materials */
    public static get defaultMaterial(): BABYLON.StandardMaterial {
        return this.getAsset("models/" + this.DEFAULT_MTL_NAME) as BABYLON.StandardMaterial;
    }

    public static get defaultMaterialTexture(): BABYLON.Texture {
        return this.getAsset("models/" + this.DEFAULT_MTL_TEXTURE_NAME) as BABYLON.Texture;
    }

    /* Models */
    public static model(name: string, parent: BABYLON.Node): BABYLON.AbstractMesh {
        const asset = this.getAsset("models/" + name + ".obj") as BABYLON.AbstractMesh;

        if (asset == undefined) {
            console.error("Asset does not exist:", name);
            return new BABYLON.Mesh("Missing Mesh");
        }

        const mesh = asset.clone(name, parent);
        mesh.isVisible = true; // Stored as invisible, make the mesh visible
        return mesh;
    }

    /* Sounds */
    public static get ambient(): BABYLON.Sound {
        return this.getAsset("sounds/ambient.mp3") as BABYLON.Sound;
    }

    public static get shootMainPlayer(): BABYLON.Sound {
        return this.getAsset("sounds/silent_1.mp3") as BABYLON.Sound;
    }

    public static get shootOtherPlayer(): BABYLON.Sound {
        return this.getAsset("sounds/silent_2.mp3") as BABYLON.Sound;
    }

    public static get bulletHit(): BABYLON.Sound {
        return this.getAsset("sounds/hit_2.mp3") as BABYLON.Sound;
    }

    public static get bulletHitPlayer(): BABYLON.Sound {
        return this.getAsset("sounds/hit_0.mp3") as BABYLON.Sound;
    }

    public static get jump(): BABYLON.Sound {
        return this.getAsset("sounds/whoosh_0.mp3") as BABYLON.Sound;
    }

    public static get randomPingSound(): BABYLON.Sound {
        return this.getAsset(`sounds/vocal_${Math.floor(Math.random() * 6)}.mp3`) as BABYLON.Sound;
    }

    public static get randomStepSound(): BABYLON.Sound {
        const possibleSteps = [0, 1, 4, 5];
        const stepIndex = possibleSteps[Math.floor(Math.random() * possibleSteps.length)];
        return this.getAsset(`sounds/step_${stepIndex}.mp3`) as BABYLON.Sound;
    }

    public static get switchProp(): BABYLON.Sound {
        return this.getAsset(`sounds/needle.mp3`) as BABYLON.Sound;
    }

    public static get huntingStartHorn(): BABYLON.Sound {
        return this.getAsset(`sounds/horn.mp3`) as BABYLON.Sound;
    }

    public static get playerDeath(): BABYLON.Sound {
        return this.getAsset(`sounds/kill.mp3`) as BABYLON.Sound;
    }
}
