#!/usr/local/bin/node

const fs = require("fs");
const PNG = require("pngjs").PNG;
const FastSimplexNoise = require("fast-simplex-noise").default;

// Generate the grass
generateGrass(false, "../public/img/grass-base.png");
generateGrass(true, "../public/img/grass-top.png");

function generateGrass(topLayer, path) {
    // Create noise generator
    const noiseGen = new FastSimplexNoise({
        min: 0, max: 1,
        frequency: topLayer ? 1 : 0.5,
        octaves: 20,
        persistence: 0.45
    });

    // Create image
    const imageSize = 32;
    const image = new PNG({
        width: imageSize,
        height: imageSize
    });

    // Generate the image
    for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
            let idx = (image.width * y + x) << 2;

            // Adjust x positions to be between 0 and 1
            const dx = x / image.width / 2; // Hack to make it not look stretched
            const dy = y / image.height;

            // Transform into 3D torus coordinates; see https://gamedev.stackexchange.com/a/23679 but divide x by 2, like above
            // X, Y, and Z are all between 0 and 1
            const c = 4, a = 1, PI = Math.PI, cos = Math.cos, sin = Math.sin; // torus parameters (controlling size)
            const xt = (c+a*cos(2*PI*dy))*cos(2*PI*dx);
            const yt = (c+a*cos(2*PI*dy))*sin(2*PI*dx);
            const zt = a*sin(2*PI*dy);

            // Generate noise
            const r = noiseGen.scaled3D(xt, yt, zt);
            const g = noiseGen.scaled3D(xt, yt, zt + 5);
            // const noise = noiseGen.scaled2D(dx, dy);
            image.data[idx] = lerp(10, 60, r);
            image.data[idx+1] = lerp(100, 150, (r + g) / 2);
            image.data[idx+2] = 0;

            // Different techiques for if top layer
            if (topLayer) {
                const alpha = noiseGen.scaled3D(xt, yt, zt + 10);
                image.data[idx+3] = alpha > 0.6 ? 255 : 0;
            } else {
                image.data[idx+3] = 255;
            }
        }
    }

    image.pack().pipe(fs.createWriteStream(path));
}

function lerp(a, b, t) {
    return (b - a) * t + a;
}
