// @vitest-environment node
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AlignmentService, mottTrim } from "../../src/main/services/alignment-service";

describe("local alignment", () => {
  it("uses Mott quality trimming bounds", () => {
    const quality = [2, 3, 30, 35, 35, 30, 3, 2];
    expect(mottTrim(quality)).toEqual({ start: 2, end: 5 });
  });

  it("aligns DNA in a worker and returns OVE tracks", async () => {
    const service = new AlignmentService(path.resolve("dist/main/alignment-worker.cjs"));
    const result = await service.align({
      mode: "multiple",
      autoTrim: false,
      sequences: [
        { id: "one", name: "one", sequence: "ACTGGGGAGGTGTA" },
        { id: "two", name: "two", sequence: "ACTGAGGTGTA" }
      ]
    });
    expect(result.tracks).toHaveLength(2);
    expect(result.tracks[0]?.alignmentData.sequence.length).toBe(result.tracks[1]?.alignmentData.sequence.length);
    service.cancelAll();
  });
});
