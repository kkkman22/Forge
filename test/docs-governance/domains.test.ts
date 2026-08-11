import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { classify } from "../../src/docs-governance/domains.js";

describe("classify", () => {
  // Excluded prefixes
  it("excludes node_modules/", () => {
    expect(classify("node_modules/pkg/README.md")).toBe("EXCLUDED");
  });

  it("excludes .git/", () => {
    expect(classify(".git/config")).toBe("EXCLUDED");
  });

  it("excludes dist/", () => {
    expect(classify("dist/output.md")).toBe("EXCLUDED");
  });

  it("excludes dist-plugin/", () => {
    expect(classify("dist-plugin/output.md")).toBe("EXCLUDED");
  });

  it("excludes apps/", () => {
    expect(classify("apps/main/README.md")).toBe("EXCLUDED");
  });

  it("excludes test-results/", () => {
    expect(classify("test-results/coverage.md")).toBe("EXCLUDED");
  });

  it("excludes .claude/worktrees/", () => {
    expect(classify(".claude/worktrees/foo/README.md")).toBe("EXCLUDED");
  });

  // Domain C (highest priority after excluded)
  it("classifies .forge/ as domain C", () => {
    expect(classify(".forge/status.md")).toBe("C");
  });

  it("classifies .kiro/specs/ as domain C", () => {
    expect(classify(".kiro/specs/test.md")).toBe("C");
  });

  // Domain B
  it("classifies skills/ as domain B", () => {
    expect(classify("skills/tinkerman/SKILL.md")).toBe("B");
  });

  it("classifies commands/ as domain B", () => {
    expect(classify("commands/tinkerman.md")).toBe("B");
  });

  it("classifies agents/ as domain B", () => {
    expect(classify("agents/reviewer.md")).toBe("B");
  });

  it("classifies .claude/agents/ as domain B", () => {
    expect(classify(".claude/agents/spec-check.md")).toBe("B");
  });

  it("classifies .claude/rules/ as domain B", () => {
    expect(classify(".claude/rules/test.md")).toBe("B");
  });

  it("classifies .github/ as domain B", () => {
    expect(classify(".github/workflows/ci.yml")).toBe("B");
  });

  // Domain A
  it("classifies docs/ as domain A", () => {
    expect(classify("docs/INDEX.md")).toBe("A");
  });

  it("classifies docs/reference-architecture.md as domain A", () => {
    expect(classify("docs/reference-architecture.md")).toBe("A");
  });

  // Domain D (root first level only)
  it("classifies root README.md as domain D", () => {
    expect(classify("README.md")).toBe("D");
  });

  it("classifies root CHANGELOG.md as domain D", () => {
    expect(classify("CHANGELOG.md")).toBe("D");
  });

  it("does NOT classify nested files as domain D", () => {
    expect(classify("subdir/README.md")).not.toBe("D");
  });

  // Priority conflicts — C beats B beats A beats D
  it(".forge/ in path beats docs/", () => {
    // .forge/ is domain C, but docs/ is domain A — C has priority
    // A file at .forge/whatever.md would be C, not A
    expect(classify(".forge/archive/audit.md")).toBe("C");
  });

  // UNCLASSIFIED
  it("returns UNCLASSIFIED for unknown top-level paths", () => {
    expect(classify("unknown-dir/file.md")).toBe("UNCLASSIFIED");
  });

  it("returns UNCLASSIFIED for nested unknown paths", () => {
    expect(classify("random/nested/file.md")).toBe("UNCLASSIFIED");
  });

  // PBT: classify always returns one of the known values
  it("PBT: result is always a valid domain or EXCLUDED/UNCLASSIFIED", () => {
    const valid = new Set(["A", "B", "C", "D", "EXCLUDED", "UNCLASSIFIED"]);
    fc.assert(
      fc.property(
        fc.string({
          unit: fc.constantFrom(
            ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-/.".split(""),
          ),
          minLength: 1,
          maxLength: 100,
        }),
        (path) => {
          if (!path.endsWith(".md")) {
            // Non-md files still classify — they just won't be docs
            // But let's add .md suffix to stay realistic
          }
          const fullPath = path.endsWith(".md") ? path : `${path}.md`;
          const result = classify(fullPath);
          expect(valid.has(result)).toBe(true);
        },
      ),
    );
  });
});
