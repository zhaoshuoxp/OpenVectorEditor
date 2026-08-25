const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const requested = process.argv.slice(2);
const targets = requested.length
  ? requested
  : [`${process.platform}-${process.arch}`];

const missing = [];
const invalidChecksums = [];
const checksumPath = path.join(projectRoot, "bin", "primer3", "SHA256SUMS");
const checksums = new Map(
  fs.readFileSync(checksumPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [checksum, relativePath] = line.trim().split(/\s+/, 2);
      return [relativePath, checksum];
    })
);

for (const target of targets) {
  const platform = target.split("-")[0];
  const exeName = platform === "win32" ? "primer3_core.exe" : "primer3_core";
  const baseDir = path.join(projectRoot, "bin", "primer3", target);
  const required = [
    path.join(baseDir, exeName),
    path.join(baseDir, "primer3_config"),
  ];

  for (const requiredPath of required) {
    if (!fs.existsSync(requiredPath)) {
      missing.push(requiredPath);
    }
  }
  if (fs.existsSync(required[0])) {
    const relativePath = path.relative(path.join(projectRoot, "bin", "primer3"), required[0]).replace(/\\/g, "/");
    const expected = checksums.get(relativePath);
    const actual = crypto.createHash("sha256").update(fs.readFileSync(required[0])).digest("hex");
    if (!expected || expected !== actual) invalidChecksums.push(`${relativePath}: expected ${expected || "missing"}, got ${actual}`);
  }
}

if (missing.length) {
  console.error("Missing Primer3 packaging resources:");
  missing.forEach((item) => console.error(`  ${item}`));
  console.error(
    "Run `yarn prepare-primer3:source` on each target platform, or provide PRIMER3_CORE_PATH, PRIMER3_CONFIG_PATH, and PRIMER3_PLATFORM_ARCH for prebuilt binaries."
  );
  process.exit(1);
}

if (invalidChecksums.length) {
  console.error("Primer3 binary checksum mismatch:");
  invalidChecksums.forEach((item) => console.error(`  ${item}`));
  process.exit(1);
}

console.info(`Primer3 resources ready for: ${targets.join(", ")}`);
