import { describe, it, expect } from "vitest";

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
