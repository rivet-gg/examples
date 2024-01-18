#!/usr/local/bin/node

const fs = require("fs");
const readline = require('readline');
const clipboardy = require("clipboardy");
const yaml = require("js-yaml");

const MODELS_PATH = __dirname + "/../public/models/";

// Make sure the prefab doesn't exist already
const existingPrefabs = fetchExistingPrefabs();

// Iterate the files to generate the prefabs
iterateFiles();

// Finds the exisiting models
function fetchExistingPrefabs() {
    // Load the yaml
    const filename = "game-config.yaml";
    const contents = fs.readFileSync(filename, "utf8");
    const data = yaml.load(contents);

    // Find the objects
    return data.prefabs.map(p => p.id);
}

// Iterates through all the files
async function iterateFiles() {
    // Get a list of files
    let configStr = "";
    for (let file of fs.readdirSync(MODELS_PATH)) {
        const modelNameBase = file.split(".").slice(0, -1).join(".");

        // Make sure it's an obj
        if (!file.endsWith(".obj"))
            continue;

        // Make sure it's not already a prefab
        if (existingPrefabs.indexOf(modelNameBase) !== -1)
            continue;

        // Generate the config
        configStr += await generateConfig(modelNameBase, file);
    }

    if (configStr.length > 0) {
        // Copy and print out data
        clipboardy.writeSync(configStr);
        console.log("Output (copied to clipboard):\n" + configStr);
    } else {
        console.log("All models imported.");
    }
}

// Generate the config
async function generateConfig(modelNameBase, fileName) {
    // Read the file
    const objData = fs.readFileSync(MODELS_PATH + fileName, "utf8");

    // Find the extent of the object
    let min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    let max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (let line of objData.split("\n")) {
        // Make sure it's a vertex
        if (!line.startsWith("v"))
            continue;

        // Get the components
        let lineComponents = line.split(" ");

        for (let i = 0; i < 3; i++) {
            // Parse the value
            let parsedValue = parseFloat(lineComponents[i+1]);

            // Set the new min and max
            if (parsedValue < min[i])
                min[i] = parsedValue;
            if (parsedValue > max[i])
                max[i] = parsedValue;
        }
    }

    // Set the min for the z axis to be 0
    min[1] = 0;

    // Flip y and z, because it's exported differently
    [min[1], min[2]] = [min[2], min[1]];
    [max[1], max[2]] = [max[2], max[1]];

    // Find the middle and size
    let center = [];
    let size = [];
    for (let i = 0; i < 3; i++) {
        size[i] = max[i] - min[i];
        center[i] = (min[i] + max[i]) / 2;
    }

    // Put the Z center at the bottom
    center[2] = 0;

    // Determine if it's a fixture
    console.log(`Is '${modelNameBase}' prop? (y/n)`);
    const isProp = (await readStdin()).toLowerCase().startsWith("y");

    // Generate kind
    let kindConfig;
    if (isProp) {
        kindConfig = ""; // Use default value
    } else {
        kindConfig = `
  kind:
    kind: fixture`;
    }

    // Print out and copy the info
    return `- id: ${modelNameBase}${kindConfig}
  rects:
  - [[${center.join(",")}], [${size.join(",")}]]
`;
}

// Wrapper around stdin for promise
function readStdin() {
    return new Promise(r => {
        let rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });

        rl.on("line", line => {
            r(line);
            rl.close();
        });
    });
}

