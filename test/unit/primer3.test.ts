import { describe, expect, it } from "vitest";
import { parsePrimer3Output, Primer3Service } from "../../src/main/services/primer3-service";
import type { PrimerDesignRequest } from "@ove/contracts";

const request: PrimerDesignRequest = {
  sequence: "ACGT".repeat(100),
  sequenceId: "fixture",
  task: "both",
  size: { min: 18, opt: 20, max: 27 },
  tm: { min: 57, opt: 60, max: 63 },
  gc: { min: 20, opt: 50, max: 80 },
  productSizeRange: "100-300",
  numReturn: 5,
  target: { start: 9, length: 21 }
};

describe("Primer3 boundary", () => {
  it("builds validated Boulder IO with explicit zero-based regions", () => {
    const app = { isPackaged: false } as Electron.App;
    const service = new Primer3Service(app, "/application");
    const input = service.buildInput(request);
    expect(input).toContain("SEQUENCE_ID=fixture");
    expect(input).toContain("SEQUENCE_TARGET=9,21");
    expect(input).toContain("PRIMER_PRODUCT_SIZE_RANGE=100-300");
    expect(input.endsWith("=\n")).toBe(true);
  });

  it("parses Primer3 output and converts the reported start for display", () => {
    const result = parsePrimer3Output([
      "PRIMER_PAIR_NUM_RETURNED=1",
      "PRIMER_LEFT_0=9,20",
      "PRIMER_LEFT_0_SEQUENCE=ACGTACGTACGTACGTACGT",
      "PRIMER_LEFT_0_TM=60.5",
      "PRIMER_RIGHT_0=199,20",
      "PRIMER_RIGHT_0_SEQUENCE=TGCATGCATGCATGCATGCA",
      "PRIMER_PAIR_0_PRODUCT_SIZE=191",
      "="
    ].join("\n"));
    expect(result.results[0]?.forward).toMatchObject({ start: 10, length: 20, tm: "60.5" });
    expect(result.results[0]?.reverse).toMatchObject({ start: 200, length: 20 });
    expect(result.results[0]?.productSize).toBe("191");
  });

  it("runs the bundled Primer3 2.6.1 binary", async () => {
    const app = { isPackaged: false } as Electron.App;
    const service = new Primer3Service(app, process.cwd());
    const result = await service.design({
      ...request,
      sequence: "GCGTACGTAGCTAGCTAGCTACGATCGATCGTTAGCTAGCTACGATCGATGCTAGCTAGCTACGATCGATCGATGCTAGCTAGCTAGCATCGATCGATCGTAGCTAGCTAGCTACGATCGATCG"
    });
    expect(result.binaryPath).toContain(`primer3${process.platform === "win32" ? "_core.exe" : "_core"}`);
    expect(result.rawOutput).toContain("PRIMER_");
    expect(result.primer3Input).toContain("PRIMER_THERMODYNAMIC_PARAMETERS_PATH=");
    service.cancelAll();
  });
});
