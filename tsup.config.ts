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
  clean: true,
  splitting: false,
  dts: false,
  external: ["electron"],
  outExtension: () => ({ js: ".cjs" })
});
