const fs = require("fs");
const archiver = require("archiver");

// Determine paths
const resourcesPath = __dirname + "/../assets";

// Create a file to stream archive data to.
const output = fs.createWriteStream(__dirname + "/../public/assets.zip");
const archive = archiver('zip', {
    zlib: { level: 9 } // Sets the compression level.
});

// Listen for all archive data to be written
output.on("close", () => {
    console.log((Math.round(archive.pointer() / 1000) / 1000) + " MB");
    console.log("Archiver has been finalized and the output file descriptor has closed.");
});

// good practice to catch warnings (ie stat failures and other non-blocking errors)
archive.on("warning", (err) => {
    if (err.code === "ENOENT") {
        // log warning
    } else {
        // throw error
        throw err;
    }
});

// Good practice to catch this error explicitly
archive.on("error", (err) => {
    throw err;
});

// Pipe archive data to the file
archive.pipe(output);

// Append all of the directories to the archive
const directories = [
    "models",
    "img",
    "sounds"
];
for (let directory of directories) {
    // Append only valid resource types; this way we don't include things like .DS_STORE
    archive.glob(`${directory}/*.@(obj|mtl|png|mp3)`, { cwd: resourcesPath });
}

// Finalize the archive (ie we are done appending files but streams have to finish yet)
archive.finalize();
