/**
 * Unit tests for the git trimmer module.
 *
 * Covers:
 *   - Diff stat parsing (per-file stats, summary line, binary files)
 *   - Status porcelain parsing (staged, modified, untracked, renames)
 *   - Empty diff
 *   - Empty status
 *
 * **Validates: Requirements 3.2, 3.3**
 */
import { describe, expect, it } from "vitest";
import { parseDiffStat, parseStatusPorcelain } from "../../src/mcp/trimmers/git.js";

describe("parseDiffStat", () => {
  it("parses a typical diff stat output", () => {
    const output = [
      " src/foo.ts | 12 ++++++------",
      " src/bar.ts |  3 +++",
      " 2 files changed, 9 insertions(+), 6 deletions(-)",
    ].join("\n");

    const result = parseDiffStat(output);

    expect(result.fileCount).toBe(2);
    expect(result.totalAdded).toBe(9);
    expect(result.totalRemoved).toBe(6);
    expect(result.files).toHaveLength(2);
    expect(result.files[0].filePath).toBe("src/foo.ts");
    expect(result.files[0].added).toBe(6);
    expect(result.files[0].removed).toBe(6);
    expect(result.files[1].filePath).toBe("src/bar.ts");
    expect(result.files[1].added).toBe(3);
    expect(result.files[1].removed).toBe(0);
  });

  it("parses insertions-only summary", () => {
    const output = [" new-file.ts | 10 ++++++++++", " 1 file changed, 10 insertions(+)"].join("\n");

    const result = parseDiffStat(output);
    expect(result.fileCount).toBe(1);
    expect(result.totalAdded).toBe(10);
    expect(result.totalRemoved).toBe(0);
  });

  it("parses deletions-only summary", () => {
    const output = [" old-file.ts | 5 -----", " 1 file changed, 5 deletions(-)"].join("\n");

    const result = parseDiffStat(output);
    expect(result.fileCount).toBe(1);
    expect(result.totalAdded).toBe(0);
    expect(result.totalRemoved).toBe(5);
  });

  it("handles binary file changes", () => {
    const output = [
      " image.png | Bin 0 -> 1234 bytes",
      " 1 file changed, 0 insertions(+), 0 deletions(-)",
    ].join("\n");

    const result = parseDiffStat(output);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].filePath).toBe("image.png");
    expect(result.files[0].added).toBe(0);
    expect(result.files[0].removed).toBe(0);
  });

  it("returns empty summary for empty diff", () => {
    const result = parseDiffStat("");
    expect(result.fileCount).toBe(0);
    expect(result.files).toHaveLength(0);
    expect(result.totalAdded).toBe(0);
    expect(result.totalRemoved).toBe(0);
    expect(result.fullDiffPath).toBeNull();
  });

  it("returns empty summary for whitespace-only input", () => {
    const result = parseDiffStat("   \n  \n  ");
    expect(result.fileCount).toBe(0);
    expect(result.files).toHaveLength(0);
  });

  it("derives fileCount from parsed files when no summary line", () => {
    const output = [" src/a.ts | 5 +++++", " src/b.ts | 3 +++"].join("\n");

    const result = parseDiffStat(output);
    expect(result.fileCount).toBe(2);
  });
});

describe("parseStatusPorcelain", () => {
  it("parses staged files (A, M in index position)", () => {
    const output = ["A  src/new-file.ts", "M  src/modified-staged.ts"].join("\n");

    const result = parseStatusPorcelain(output);
    expect(result.staged.count).toBe(2);
    expect(result.staged.files).toContain("src/new-file.ts");
    expect(result.staged.files).toContain("src/modified-staged.ts");
    expect(result.modified.count).toBe(0);
    expect(result.untracked.count).toBe(0);
  });

  it("parses unstaged modifications (M in worktree position)", () => {
    const output = " M src/changed.ts";

    const result = parseStatusPorcelain(output);
    expect(result.modified.count).toBe(1);
    expect(result.modified.files).toContain("src/changed.ts");
    expect(result.staged.count).toBe(0);
  });

  it("parses untracked files", () => {
    const output = ["?? new-file.ts", "?? another-new.ts"].join("\n");

    const result = parseStatusPorcelain(output);
    expect(result.untracked.count).toBe(2);
    expect(result.untracked.files).toContain("new-file.ts");
    expect(result.untracked.files).toContain("another-new.ts");
  });

  it("handles files that are both staged and modified", () => {
    // MM = staged in index, modified in worktree
    const output = "MM src/both.ts";

    const result = parseStatusPorcelain(output);
    expect(result.staged.count).toBe(1);
    expect(result.staged.files).toContain("src/both.ts");
    expect(result.modified.count).toBe(1);
    expect(result.modified.files).toContain("src/both.ts");
  });

  it("handles renames (R status)", () => {
    const output = "R  old-name.ts -> new-name.ts";

    const result = parseStatusPorcelain(output);
    expect(result.staged.count).toBe(1);
    expect(result.staged.files).toContain("new-name.ts");
  });

  it("limits files to 10 per category", () => {
    const lines = Array.from({ length: 15 }, (_, i) => `?? file${i}.ts`);
    const output = lines.join("\n");

    const result = parseStatusPorcelain(output);
    expect(result.untracked.count).toBe(15);
    expect(result.untracked.files).toHaveLength(10);
  });

  it("returns empty summary for empty status", () => {
    const result = parseStatusPorcelain("");
    expect(result.staged.count).toBe(0);
    expect(result.staged.files).toHaveLength(0);
    expect(result.modified.count).toBe(0);
    expect(result.modified.files).toHaveLength(0);
    expect(result.untracked.count).toBe(0);
    expect(result.untracked.files).toHaveLength(0);
  });

  it("returns empty summary for whitespace-only input", () => {
    const result = parseStatusPorcelain("   \n  ");
    expect(result.staged.count).toBe(0);
    expect(result.modified.count).toBe(0);
    expect(result.untracked.count).toBe(0);
  });

  it("handles deleted files (D status)", () => {
    const output = "D  src/removed.ts";

    const result = parseStatusPorcelain(output);
    expect(result.staged.count).toBe(1);
    expect(result.staged.files).toContain("src/removed.ts");
  });

  it("handles mixed status types", () => {
    const output = [
      "A  src/added.ts",
      "M  src/staged-mod.ts",
      " M src/unstaged-mod.ts",
      "?? src/untracked.ts",
      "D  src/deleted.ts",
    ].join("\n");

    const result = parseStatusPorcelain(output);
    expect(result.staged.count).toBe(3); // A, M, D
    expect(result.modified.count).toBe(1); // unstaged M
    expect(result.untracked.count).toBe(1); // ??
  });
});
