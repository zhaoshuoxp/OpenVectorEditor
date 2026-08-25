import { describe, expect, it } from "vitest";
import { getRangeSequence, normalizeDnaSequence } from "@ove/editor-engine/sequence";
import {
  displayRangeToInternal,
  selectedSequence,
  selectionToDisplayRange
} from "../../src/renderer/domain/sequence";

describe("sequence boundary conversions", () => {
  it("keeps internal coordinates zero-based and display coordinates one-based", () => {
    expect(selectionToDisplayRange({ start: 0, end: 9 })).toEqual({ start: 1, end: 10 });
    expect(displayRangeToInternal(1, 10)).toEqual({ start: 0, end: 9 });
  });

  it("normalizes invalid DNA symbols without changing length", () => {
    expect(normalizeDnaSequence("ac gt-RYu")).toBe("ACGTNNN");
  });

  it("extracts inclusive linear ranges", () => {
    expect(getRangeSequence("AACCGGTT", 2, 5, false)).toBe("CCGG");
  });

  it("extracts circular ranges that cross the origin", () => {
    expect(getRangeSequence("AACCGGTT", 6, 1, true)).toBe("TTAA");
    expect(selectedSequence({ sequence: "AACCGGTT", circular: true }, { start: 6, end: 1 })).toBe("TTAA");
  });

  it("rejects a reverse range on a linear sequence", () => {
    expect(getRangeSequence("AACCGGTT", 6, 1, false)).toBe("");
  });
});
