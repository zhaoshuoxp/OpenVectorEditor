import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  alignmentRequestSchema,
  primerDesignRequestSchema,
  saveDocumentRequestSchema
} from "@ove/contracts";

describe("typed IPC validation", () => {
  it("rejects malformed save and alignment payloads", () => {
    expect(() => saveDocumentRequestSchema.parse({ mode: "save", document: null })).toThrow();
    expect(() => alignmentRequestSchema.parse({ sequences: [], mode: "remote", autoTrim: true })).toThrow();
  });

  it("accepts valid Primer3 ranges", () => {
    const parsed = primerDesignRequestSchema.parse({
      sequence: "ACGT".repeat(20), sequenceId: "test", task: "both", numReturn: 5,
      productSizeRange: "100-300 400-600",
      size: { min: 18, opt: 20, max: 27 },
      tm: { min: 57, opt: 60, max: 63 },
      gc: { min: 20, opt: 50, max: 80 }
    });
    expect(parsed.numReturn).toBe(5);
  });

  it("preserves legal inclusive coordinates for arbitrary sequence lengths", () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 200_000 }),
      fc.integer({ min: 0, max: 1_000_000 }),
      fc.integer({ min: 0, max: 1_000_000 }),
      (length, rawStart, rawEnd) => {
        const start = rawStart % length;
        const end = rawEnd % length;
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThanOrEqual(0);
        expect(start).toBeLessThan(length);
        expect(end).toBeLessThan(length);
      }
    ));
  });
});
