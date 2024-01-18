import { float } from "./types";

export const Utils = {
    get pixelRatio(): float {
        return window.devicePixelRatio || 1;
    }
};
