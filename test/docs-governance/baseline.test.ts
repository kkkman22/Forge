import { describe, expect, it } from "vitest";
import { classify } from "../../src/docs-governance/domains.js";
import type { Domain } from "../../src/docs-governance/types.js";

describe("baseline report generation", () => {
  it("classifies all test fixture paths correctly", () => {
    const testPaths = [
      { path: "docs/INDEX.md", expected: "A" as Domain },
      { path: "docs/reference-architecture.md", expected: "A" as Domain },
      { path: "README.md", expected: "D" as Domain },
      { path: "CHANGELOG.md", expected: "D" as Domain },
      { path: ".forge/status.md", expected: "C" as Domain },
      { path: "skills/tinkerman/SKILL.md", expected: "B" as Domain },
      { path: "src/index.ts", expected: "B" as Domain },
      { path: "node_modules/x/readme.md", expected: "EXCLUDED" },
    ];

    for (const { path, expected } of testPaths) {
      expect(classify(path)).toBe(expected);
    }
  });

  it("detects UNCLASSIFIED paths", () => {
    const unclassified = classify("random-dir/file.md");
    expect(unclassified).toBe("UNCLASSIFIED");
  });
});
