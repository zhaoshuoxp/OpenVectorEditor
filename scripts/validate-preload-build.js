const fs = require("node:fs");
const path = require("node:path");

const preloadPath = path.resolve(__dirname, "../dist/preload/preload.cjs");
const source = fs.readFileSync(preloadPath, "utf8");
const requiredModules = [...source.matchAll(/require\(["']([^"']+)["']\)/g)]
  .map((match) => match[1]);
const forbiddenModules = [...new Set(requiredModules.filter((name) => name !== "electron"))];

if (forbiddenModules.length) {
  throw new Error(
    `Sandboxed preload contains unsupported require calls: ${forbiddenModules.join(", ")}`
  );
}
if (!source.includes('exposeInMainWorld("desktopApi"')) {
  throw new Error("Sandboxed preload does not expose desktopApi.");
}

console.info("Sandboxed preload is self-contained and only requires Electron.");
