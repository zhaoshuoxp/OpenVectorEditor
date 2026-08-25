// @vitest-environment node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HistoryService } from "../../src/main/services/history-service";
import { PreferencesService } from "../../src/main/services/preferences-service";
import {
  atomicWriteSequenceDocument,
  formatSequenceDocument,
  readSequenceFile
} from "../../src/main/services/file-service";

const temporaryDirectories: string[] = [];
async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ove-electron-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("desktop persistence", () => {
  it("parses the legacy pA11990 GenBank fixture", async () => {
    const document = await readSequenceFile(path.resolve("pA11990.gb"));
    expect(document.sequence?.length).toBeGreaterThan(1_000);
    expect(document.features?.length).toBeGreaterThan(0);
  });

  it("round-trips TeselaGen JSON semantically", async () => {
    const directory = await temporaryDirectory();
    const filePath = path.join(directory, "fixture.json");
    const document = {
      name: "fixture",
      sequence: "AACCGGTT",
      circular: true,
      features: [{ id: "feature-1", start: 6, end: 1, name: "origin" }]
    };
    await atomicWriteSequenceDocument(document, filePath);
    expect(await readSequenceFile(filePath)).toEqual(document);
  });

  it("serializes FASTA and GenBank without losing the sequence", async () => {
    const document = { name: "fixture", sequence: "AACCGGTT", circular: false };
    const fasta = await formatSequenceDocument(document, "fixture.fasta");
    const genbank = await formatSequenceDocument(document, "fixture.gb");
    expect(fasta).toContain("AACCGGTT");
    expect(genbank.toUpperCase()).toContain("AACCGGTT");
  });

  it("keeps at most 50 isolated save checkpoints", async () => {
    const directory = await temporaryDirectory();
    const history = new HistoryService(path.join(directory, "history"));
    const firstFile = path.join(directory, "a.gb");
    const secondFile = path.join(directory, "b.gb");
    for (let index = 0; index < 55; index += 1) {
      await history.record(firstFile, { name: `v${index}`, sequence: "ACGT" });
    }
    await history.record(secondFile, { name: "other", sequence: "TTTT" });
    expect(await history.list(firstFile)).toHaveLength(50);
    expect((await history.list(firstFile))[0]?.document.name).toBe("v54");
    expect(await history.list(secondFile)).toHaveLength(1);
  });

  it("persists dark mode and axis font scale", async () => {
    const directory = await temporaryDirectory();
    const preferences = new PreferencesService(directory);
    expect(await preferences.get()).toEqual({ isDarkMode: false, axisFontScalePercent: 100 });
    await preferences.update({ isDarkMode: true, axisFontScalePercent: 150 });
    expect(await new PreferencesService(directory).get()).toEqual({ isDarkMode: true, axisFontScalePercent: 150 });
  });
});
