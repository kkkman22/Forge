import { describe, it, expect } from "vitest";

describe("classifyConflictZone", () => {
  it("classifies frozen paths", async () => {
    const { classifyConflictZone } = await import("../src/conflict-resolver.js");
    expect(classifyConflictZone(".forge/specs/auth/spec.md", "")).toBe("frozen");
    expect(classifyConflictZone(".forge/config.md", "")).toBe("frozen");
    expect(classifyConflictZone(".forge/plans/auth.md", "")).toBe("frozen");
  });

  it("classifies guarded paths", async () => {
    const { classifyConflictZone } = await import("../src/conflict-resolver.js");
    expect(classifyConflictZone(".forge/progress/auth.md", "")).toBe("guarded");
    expect(classifyConflictZone(".forge/reviews/auth.md", "")).toBe("guarded");
    expect(classifyConflictZone(".forge/knowledge/instincts.md", "")).toBe("guarded");
    expect(classifyConflictZone(".forge/decisions/ADR-001.md", "")).toBe("guarded");
    expect(classifyConflictZone(".forge/knowledge/known-failures.md", "")).toBe("guarded");
    expect(classifyConflictZone(".forge/knowledge/solutions/x.md", "")).toBe("guarded");
  });

  it("classifies open paths", async () => {
    const { classifyConflictZone } = await import("../src/conflict-resolver.js");
    expect(classifyConflictZone(".forge/findings/x.md", "")).toBe("open");
    expect(classifyConflictZone(".forge/debug/y.md", "")).toBe("open");
  });

  it("classifies source paths", async () => {
    const { classifyConflictZone } = await import("../src/conflict-resolver.js");
    expect(classifyConflictZone("src/index.ts", "")).toBe("source");
    expect(classifyConflictZone("test/a.test.ts", "")).toBe("source");
  });

  it("delegates to conflict-classifier for all paths", async () => {
    const { classifyConflictZone } = await import("../src/conflict-resolver.js");
    expect(classifyConflictZone(".forge/plans/auth.md", "")).toBe("frozen");
    expect(classifyConflictZone(".forge/knowledge/solutions/x.md", "")).toBe("guarded");
  });
});

describe("parseConflictedPaths", () => {
  it("extracts conflicted file paths from git stderr", async () => {
    const { parseConflictedPaths } = await import("../src/conflict-resolver.js");
    const gitOutput = `Auto-merging .forge/progress/auth.md
CONFLICT (content): Merge conflict in .forge/progress/auth.md
Auto-merging .forge/reviews/auth.md
CONFLICT (content): Merge conflict in .forge/reviews/auth.md
Auto-merging src/index.ts
CONFLICT (content): Merge conflict in src/index.ts`;
    const paths = parseConflictedPaths(gitOutput);
    expect(paths).toEqual([
      ".forge/progress/auth.md",
      ".forge/reviews/auth.md",
      "src/index.ts",
    ]);
  });

  it("returns empty array when no conflicts", async () => {
    const { parseConflictedPaths } = await import("../src/conflict-resolver.js");
    expect(parseConflictedPaths("Already up to date.")).toEqual([]);
  });

  it("deduplicates paths", async () => {
    const { parseConflictedPaths } = await import("../src/conflict-resolver.js");
    const output = `CONFLICT: Merge conflict in .forge/progress/a.md\nCONFLICT: Merge conflict in .forge/progress/a.md`;
    const paths = parseConflictedPaths(output);
    expect(paths).toEqual([".forge/progress/a.md"]);
  });
});
