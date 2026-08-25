import { describe, expect, it, vi } from "vitest";
import {
  findTemplateMatches,
  parseApeTemplates,
  parseCsvTemplates
} from "../../src/renderer/tools/AutoAnnotatePanel";

vi.stubGlobal("crypto", { randomUUID: () => "annotation-id" });

describe("auto annotation compatibility", () => {
  it("parses quoted CSV fields", () => {
    const parsed = parseCsvTemplates(
      'name,description,sequence,type,isRegex,matchType\nM13,"forward, universal",TGTAAA,primer_bind,false,dna'
    );
    expect(parsed).toEqual([{
      name: "M13",
      description: "forward, universal",
      sequence: "TGTAAA",
      type: "primer_bind",
      isRegex: false,
      matchType: "dna"
    }]);
  });

  it("parses ApE tab-separated feature lists", () => {
    expect(parseApeTemplates("T3\tATTAAC\tprimer_bind")[0]).toMatchObject({
      name: "T3",
      sequence: "ATTAAC",
      type: "primer_bind"
    });
  });

  it("finds forward and reverse-complement DNA matches", () => {
    const matches = findTemplateMatches(
      { sequence: "AAATGCCGGGCATTT", circular: false },
      { name: "site", sequence: "ATGC", isRegex: false, matchType: "dna" }
    );
    expect(matches.map(({ start, end, forward }) => ({ start, end, forward }))).toEqual([
      { start: 2, end: 5, forward: true },
      { start: 9, end: 12, forward: false }
    ]);
  });

  it("finds a circular match crossing the origin", () => {
    const matches = findTemplateMatches(
      { sequence: "CCCAAATT", circular: true },
      { name: "origin", sequence: "TTCCC", isRegex: false, matchType: "dna" }
    );
    expect(matches).toContainEqual(expect.objectContaining({ start: 6, end: 2, forward: true }));
  });
});
