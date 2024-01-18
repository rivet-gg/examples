#!/usr/local/bin/node

const fs = require("fs");
const yaml = require("js-yaml");

// Get the offsets
const args = process.argv.slice(2);
const offsetX = parseInt(args[0]);
const offsetY = parseInt(args[1]);
const offsetZ = parseInt(args[2]);
console.log("Offsetting by ", offsetX, offsetY, offsetZ);

// Load the YAML
const filename = __dirname + "/../game-config.yaml";
const contents = fs.readFileSync(filename, "utf8");
const data = yaml.load(contents);

// Print out the translated objects
const objects = data.maps["map-a"].objects;
for (let object of objects) {
    // Only change prefabs
    if (object.prefabId == undefined) continue;

    // Modify the offset
    const newPosition = object.position;
    newPosition[0] += offsetX;
    newPosition[1] += offsetY;
    newPosition[2] += offsetZ;

    // Print the new data
    console.log(`- prefabId: ${object.prefabId}`);
    console.log(`  position: [${newPosition.join(",")}]`);
    if (object.rotation != undefined) {
        console.log(`  rotation: ${object.rotation}`);
    }
}
