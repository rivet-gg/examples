#!/usr/local/bin/node

const fs = require("fs");
const clipboardy = require("clipboardy");

// Constants
const EXPORTS_PATH = "./exports/";
const MODELS_PATH = __dirname + "/../public/models/";
const DEFAULT_MATERIAL_NAME = "default-material";

// Extract the args
const args = process.argv.slice(2);

// Get the model to import
const modelName = args[0]; // The name that MagicaVoxel exported it as
const modelImportName = args[1]; // The name to import it as

// Warn against paths
if (modelImportName.indexOf("/") !== -1) {
    console.warn("Cannot use path for model.")
}

// Read the file data
const objData = fs.readFileSync(EXPORTS_PATH + modelName + ".obj", "utf8")
    .replace("g " + modelName, "g " + modelImportName) // Replace the old group name
    .replace(`mtllib ${modelName}.mtl`, `mtllib ${DEFAULT_MATERIAL_NAME}.mtl`); // Replace the default material

// Write the obj data
fs.writeFileSync(MODELS_PATH + modelImportName + ".obj", objData);

// Replace the texture path and copy over the material file
const mtlData = fs.readFileSync(EXPORTS_PATH + modelName + ".mtl", "utf8")
    .replace(`map_Kd ${modelName}.png`, `map_Kd ${DEFAULT_MATERIAL_NAME}.png`); // Old texture name
fs.writeFileSync(MODELS_PATH + DEFAULT_MATERIAL_NAME + ".mtl", mtlData);

// Copy over the material texture
fs.copyFileSync(EXPORTS_PATH + modelName + ".png", MODELS_PATH + DEFAULT_MATERIAL_NAME + ".png");
