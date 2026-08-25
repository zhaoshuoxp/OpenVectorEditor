import { describe, expect, it } from "vitest";
import { TOOL_REGISTRY } from "../../src/renderer/tools/registry";

describe("local tool registry", () => {
  it("registers toolbar and menu tools behind stable identifiers", () => {
    expect([...TOOL_REGISTRY.keys()]).toEqual([
      "primer-design",
      "alignment",
      "version-history",
      "auto-annotate-features",
      "auto-annotate-parts",
      "auto-annotate-primers"
    ]);
    expect(TOOL_REGISTRY.get("primer-design")?.toolbarTool).toBe("oligoTool");
    expect(TOOL_REGISTRY.get("alignment")?.toolbarTool).toBe("alignmentTool");
  });
});
