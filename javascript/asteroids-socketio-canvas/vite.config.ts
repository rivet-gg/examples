import { defineConfig } from "vite";

import { nodePolyfills } from "vite-plugin-node-polyfills";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
    plugins: [
        tsconfigPaths(),
        nodePolyfills({ globals: { Buffer: true } }),
    ],
    build: {
        outDir: "./build/client/",
        emptyOutDir: true,
    },
});
