const fs = require("node:fs");
const path = require("node:path");

const rendererDirectory = path.resolve(__dirname, "../dist/renderer");
const htmlPath = path.join(rendererDirectory, "index.html");
const html = fs.readFileSync(htmlPath, "utf8");

const assetReferences = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((reference) => !reference.startsWith("data:"));

const absoluteReferences = assetReferences.filter((reference) => reference.startsWith("/"));
if (absoluteReferences.length) {
  throw new Error(
    `Packaged renderer contains file://-incompatible absolute URLs: ${absoluteReferences.join(", ")}`
  );
}

const missingAssets = assetReferences.filter((reference) => {
  const relativeReference = reference.replace(/^\.\//, "");
  return !fs.existsSync(path.join(rendererDirectory, relativeReference));
});
if (missingAssets.length) {
  throw new Error(`Packaged renderer references missing files: ${missingAssets.join(", ")}`);
}

if (!assetReferences.some((reference) => reference.endsWith(".js"))) {
  throw new Error("Packaged renderer does not reference a JavaScript entry point.");
}

console.info(`Renderer build contains ${assetReferences.length} valid relative asset references.`);
