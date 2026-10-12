import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "main/main": "src/main/main.ts",
    "main/alignment-worker": "src/main/alignment-worker.ts",
    "main/notarize": "src/main/notarize.ts",
    "preload/preload": "src/preload/preload.ts"
  },
  outDir: "dist",
  format: ["cjs"],
  target: "node22",
  platform: "node",
  sourcemap: true,
  // dist/renderer belongs to vite; `npm test` runs tsup via pretest and must not delete it.
  clean: ["!renderer/**"],
  splitting: false,
  dts: false,
  external: ["electron"],
  outExtension: () => ({ js: ".cjs" })
});
