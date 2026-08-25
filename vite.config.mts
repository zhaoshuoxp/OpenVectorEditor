import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Packaged Electron renders this file from app.asar through file://.
  // Absolute /assets URLs resolve against the filesystem root and produce a blank window.
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@ove/contracts": path.join(rootDir, "packages/contracts/src/index.ts"),
      "@ove/editor-engine/sequence": path.join(rootDir, "packages/editor-engine/src/sequence.ts"),
      "@ove/editor-engine": path.join(rootDir, "packages/editor-engine/src/index.ts")
    }
  },
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    sourcemap: true,
    // OVE still ships legacy Blueprint selectors that Lightning CSS rejects.
    // esbuild preserves their historical browser behavior and keeps output minified.
    cssMinify: "esbuild"
  }
});
