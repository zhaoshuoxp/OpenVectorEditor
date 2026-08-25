import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@ove/contracts": path.join(rootDirectory, "packages/contracts/src/index.ts"),
      "@ove/editor-engine/sequence": path.join(rootDirectory, "packages/editor-engine/src/sequence.ts"),
      "@ove/editor-engine": path.join(rootDirectory, "packages/editor-engine/src/index.ts")
    }
  },
  test: {
    environment: "jsdom",
    include: ["test/unit/**/*.test.ts", "test/unit/**/*.test.tsx"],
    coverage: { reporter: ["text", "html"] }
  }
});
