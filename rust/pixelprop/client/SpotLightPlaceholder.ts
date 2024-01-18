import * as BABYON from "babylonjs";
import {float} from "./types";

export class SpotLightPlaceholder extends BABYLON.TransformNode {
    public direction: BABYLON.Vector3 = BABYLON.Vector3.Zero();
    public angle: float = 0;
    public intensity: float = 0;
    public exponent: float = 0;
    public diffuse: BABYLON.Color3 = BABYLON.Color3.White();
    public specular: BABYLON.Color3 = BABYLON.Color3.White();

    public constructor(name: string) {
        super(name);
    }
}
