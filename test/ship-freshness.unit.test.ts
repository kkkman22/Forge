/**
 * Unit tests for checkReviewFreshness edge cases.
 */
import { describe, expect, it } from "vitest";
import { checkReviewFreshness } from "../src/ship.js";

describe("checkReviewFreshness — unit tests", () => {
  it("undefined commit → fresh (backward compat)", () => {
    const result = checkReviewFreshness(undefined, "abc123", []);
    expect(result).toEqual({
      fresh: true,
      reason: "no reviewed_at_commit field (backward compatible)",
    });
  });

  it("same commit → fresh", () => {
    const result = checkReviewFreshness("abc123", "abc123", []);
    expect(result).toEqual({
      fresh: true,
      reason: "review matches current HEAD",
    });
  });

  it("same commit with non-empty file list → still fresh", () => {
    const result = checkReviewFreshness("abc123", "abc123", ["src/foo.ts"]);
    expect(result.fresh).toBe(true);
  });

  it("different commit, empty file list → fresh (.tinkerman/-only vacuously)", () => {
    const result = checkReviewFreshness("aaa", "bbb", []);
    expect(result).toEqual({
      fresh: true,
      reason: "changes only in .tinkerman/ state files",
    });
  });

  it("different commit, only .tinkerman/ files → fresh", () => {
    const result = checkReviewFreshness("aaa", "bbb", [
      ".tinkerman/status.md",
      ".tinkerman/reviews/test.md",
    ]);
    expect(result).toEqual({
      fresh: true,
      reason: "changes only in .tinkerman/ state files",
    });
  });

  it("different commit, mixed files → not fresh, only non-.tinkerman/ files listed", () => {
    const result = checkReviewFreshness("aaa", "bbb", [
      ".tinkerman/status.md",
      "src/foo.ts",
      ".tinkerman/reviews/test.md",
      "lib/bar.js",
    ]);
    expect(result).toEqual({
      fresh: false,
      reason: "project code changed since review",
      changedFiles: ["src/foo.ts", "lib/bar.js"],
    });
  });

  it("different commit, only project files → not fresh", () => {
    const result = checkReviewFreshness("aaa", "bbb", ["src/a.ts", "src/b.ts"]);
    expect(result).toEqual({
      fresh: false,
      reason: "project code changed since review",
      changedFiles: ["src/a.ts", "src/b.ts"],
    });
  });

  it("empty string commit is treated as defined but different", () => {
    const result = checkReviewFreshness("", "abc", ["src/a.ts"]);
    expect(result.fresh).toBe(false);
  });
});
