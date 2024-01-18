import * as BABYLON from "babylonjs";
import {RectArray} from "../../Utils";
import {float} from "../../types";

export class Minimap extends BABYLON.GUI.Ellipse {
    public static defaultScale = 1 / 4; // The scale of the map per unit
    public static minimapScaleClose = 1;
    public static minimapScaleFar = 1 / 2;
    public static fullMapScale = 1 / 2;

    private offsetContainer: BABYLON.GUI.Container;
    private minimapTexture: BABYLON.GUI.Image;
    private minimapOverlay: BABYLON.GUI.Image;
    private mapPings: BABYLON.GUI.Ellipse[] = [];

    private xOffset: number = 0;
    private yOffset: number = 0;

    public get playerVisible(): boolean { return this.minimapOverlay.isVisible; }
    public set playerVisible(v: boolean) { this.minimapOverlay.isVisible = v; }

    private _fullMapView = false;
    public get fullMapView(): boolean { return this._fullMapView; }
    public set fullMapView(fullMap: boolean) {
        // Save value
        this._fullMapView = fullMap;

        // Update map size
        if (fullMap) {
            this.width = "300px";
            this.height = "300px";
        } else {
            this.width = "150px";
            this.height = "150px";
        }
    }

    public get actualMapScale(): float { return this.fullMapView ? Minimap.fullMapScale : this.mapScale; }

    public constructor(public mapScale: number, scene: BABYLON.Scene) {
        super("Minimap");

        // Configure minimap
        this.background = "rgba(0, 0, 0, 0.5)";
        this.top = "-30px";
        this.left = "30px";
        this.thickness = 0;

        // Add the offset container
        this.offsetContainer = new BABYLON.GUI.Container();
        this.offsetContainer.width = 99999;
        this.offsetContainer.height = 99999;
        this.addControl(this.offsetContainer);

        // Create the texture
        this.minimapTexture = new BABYLON.GUI.Image("Minimap Texture");
        this.minimapTexture.scaleY = -1; // Coordinates inverted
        this.offsetContainer.addControl(this.minimapTexture);

        // Add the player
        this.minimapOverlay = new BABYLON.GUI.Image("Minimap Overlay", "/img/minimap-flashlight.png");
        this.minimapOverlay.width = this.minimapOverlay.height = "150px";
        this.addControl(this.minimapOverlay);

        // Configure map view
        this.fullMapView = false;
    }

    public update(dt: float) {
        // Update the offset scale
        const mapScale = this.actualMapScale;
        this.offsetContainer.scaleX = mapScale;
        this.offsetContainer.scaleY = mapScale;
        this.offsetContainer.left = -this.xOffset * mapScale * Minimap.defaultScale + "px";
        this.offsetContainer.top = this.yOffset * mapScale * Minimap.defaultScale + "px";

        // Update the pings
        const fadeTime = 20;
        const growSpeed = 400;
        for (let ping of this.mapPings) {

            // Grow the ping
            ping.width = ping.height = (ping.widthInPixels + growSpeed * dt) + "px";

            // Change the alpha
            ping.alpha -= dt / fadeTime;
        }

        // Remove finished pings
        for (let i = this.mapPings.length - 1; i >= 0; i--) {
            const ping = this.mapPings[i];

            // Only remove if alpha is 0
            if (ping.alpha > 0)
                continue;

            // Dispose and remove the item
            this.mapPings.splice(i, 1);
            ping.dispose();
        }
    }

    public ping(x: float, y: float) {
        // Create ping item
        const ping = new BABYLON.GUI.Ellipse();
        ping.left = x + "px";
        ping.top = -y + "px";
        ping.width = "200px";
        ping.height = "200px";
        ping.background = "transparent";
        ping.color = "red";
        ping.alpha = 1;
        ping.thickness = 16;
        this.offsetContainer.addControl(ping);

        // Save it
        this.mapPings.push(ping);
    }

    public updatePlayerPosition(x: float, y: float, dir: float) {
        // Update offset; these will be updated in the render function
        this.xOffset = x;
        this.yOffset = y;

        // Rotate the overlay
        this.minimapOverlay.rotation = -dir + Math.PI / 2;
    }

    public applyData(rects: [string, RectArray][]) {
        // Get the scale of the map
        const scale = Minimap.defaultScale;

        // Create a canvas to render to
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        // Find the extent of the rects
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (let body of rects) {
            for (let rect of body[1]) {
                const [center, size] = rect;

                let lowerX = center[0] - size[0] / 2;
                let upperX = center[0] + size[0] / 2;
                let lowerY = center[1] - size[1] / 2;
                let upperY = center[1] + size[1] / 2;

                if (lowerX < minX) minX = lowerX;
                if (upperX > maxX) maxX = upperX;
                if (lowerY < minY) minY = lowerY;
                if (upperY > maxY) maxY = upperY;
            }
        }
        canvas.width = (maxX - minX) * scale;
        canvas.height = (maxY - minY) * scale;

        // Render the objects
        const offsetX = -minX;
        const offsetY = -minY;
        for (let body of rects) {
            // Set the color
            let color = body[0];
            context.fillStyle = color;

            // Render the rectangles
            for (let rect of body[1]) {
                const [center, size] = rect;

                // Determine the height of the top of the object and calculate the shade from the height; we use an inverse
                // curve on the height in order to be able to show depth for really tall items vs normally tall items; see
                // https://www.desmos.com/calculator/aodtqsw9l4
                const height = center[2] + size[2] / 2;
                context.globalAlpha = 1 - Math.pow(height + 1, -0.5);

                // Draw the rect
                context.fillRect(
                    (center[0] - size[0] / 2 + offsetX) * scale,
                    (center[1] - size[1] / 2 + offsetY) * scale,
                    size[0] * scale,
                    size[1] * scale
                );
            }
        }

        // Update the size and add the offset
        this.minimapTexture.width = canvas.width + "px";
        this.minimapTexture.height = canvas.height + "px";
        this.minimapTexture.left = (canvas.width / 2 - offsetX * scale) + "px";
        this.minimapTexture.top = (-canvas.height / 2 + offsetY * scale) + "px";

        // Apply the data
        this.minimapTexture.source = canvas.toDataURL();
    }
}
