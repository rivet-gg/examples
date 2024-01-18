import {float, int} from "./types";
import * as BABYLON from "babylonjs";
import SimplexNoise = require("simplex-noise");

/* Types */
export type VectorArray = [float, float, float];
export type RectArray = [VectorArray, VectorArray];

/* Store Data */
export interface StoreData {
    characters: {
        id: string,
        name: string,
    }[]
}

/* Naming */
export const NodeNames = {
    ENTITY_NODE_BASE: "Node: ",
    ROTATION_NODE: "Rotation Node",
    DIRECTION_NODE: "Direction Node",
    BOUNDING_BOX: "Bounding Box",

    SPOT_LIGHT: "Spot Light",

    FLASHLIGHT: "Flashlight",

    generateEntityNodeName(entityId: int) {
        return this.ENTITY_NODE_BASE + entityId;
    }
};

/* General Utils */
export const Utils = {
    fontFamily: "PressStart2P-Regular",

    get pixelRatio(): float {
        return window.devicePixelRatio || 1;
    },

    arrayToVector(array: VectorArray): BABYLON.Vector3 {
        return new BABYLON.Vector3(array[0], array[1], array[2]);
    },

    _safeNodeNames: [NodeNames.BOUNDING_BOX],
    clearChildren(node: BABYLON.Node) {
        node.getChildren(node => this._safeNodeNames.indexOf(node.name) == -1).map(node => node.dispose());
    },

    /// Gets the ID of the entity that a node is a child of by traversing the node names and finding one that matches the pattern
    entityIdFromChildNode(node: BABYLON.Node): int | undefined {
        if (node.name.startsWith(NodeNames.ENTITY_NODE_BASE)) {
            return parseInt(node.name.substring(NodeNames.ENTITY_NODE_BASE.length));
        } else if (node.parent) {
            return this.entityIdFromChildNode(node.parent);
        } else {
            return undefined;
        }
    },

    /// Get a flicker value
    _flickerSimplex: new SimplexNoise(Math.random),
    flickerMultiplier(minIntensity: number, maxIntensity: number, speedScale: number = 1, offset: number = 0): number {
        const n = this._flickerSimplex.noise2D(Date.now() / 1000 * speedScale + offset, 0);
        return minIntensity + n * (maxIntensity - minIntensity);
    },

    /// Flicker an item's alpha
    _flickerIndex: 0, // Number of GUI flicker items that have been created; this is used to randomly the offset for each
    flickerGUIItem(element: BABYLON.GUI.Control) {
        element.alpha = 0.5;
        // TODO: Find a safer way of doing this

        // const flickerOffset = this._flickerIndex++;
        // element.onAfterDrawObservable.add(() => {
        //     element.alpha = Utils.flickerMultiplier(0.8, 1.0, 3, flickerOffset * 100)
        // });
    },

    /// Generate default store data for if the store hasn't loaded yet
    defaultStoreData: {
        characters: [
            { id: "basic", name: "Basic" }
        ]
    } as StoreData
};
