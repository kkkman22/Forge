/**
 * Unit tests for source-tree hard-frozen file detection.
 *
 * Covers:
 *   - `src/prompt-defense-patterns.ts` is classified as hard-frozen
 *   - Absolute, relative, and worktree-nested paths all match
 *   - Non-listed source files are NOT hard-frozen
 *
 * **Validates: Requirement 5.10**
 */

import { describe, expect, it } from "vitest";
import { isHardFrozenSourceFile, isMainEntry } from "../src/check-frozen.js";

describe("isHardFrozenSourceFile", () => {
  it("flags the prompt-defense pattern library", () => {
    expect(isHardFrozenSourceFile("src/prompt-defense-patterns.ts")).toBe(true);
  });

  it("matches absolute paths", () => {
    expect(isHardFrozenSourceFile("/Users/king/code/Forge/src/prompt-defense-patterns.ts")).toBe(
      true,
    );
  });

  it("matches worktree-nested paths", () => {
    expect(isHardFrozenSourceFile(".claude/worktrees/foo/src/prompt-defense-patterns.ts")).toBe(
      true,
    );
  });

  it("normalises backslash separators", () => {
    expect(isHardFrozenSourceFile("src\\prompt-defense-patterns.ts")).toBe(true);
  });

  it("leaves unrelated source files alone", () => {
    expect(isHardFrozenSourceFile("src/router.ts")).toBe(false);
    expect(isHardFrozenSourceFile("src/prompt-defense.ts")).toBe(false);
    expect(isHardFrozenSourceFile("src/adr-registry.ts")).toBe(false);
  });

  it("does not match partial names", () => {
    // Even though the substring "prompt-defense-patterns.ts" appears,
    // it's not a path suffix — must be either exact or "/...-suffix".
    expect(isHardFrozenSourceFile("src/not-prompt-defense-patterns.ts")).toBe(false);
  });
});

// --- REQ-05 (T5): cross-platform CLI entry-point detection ---

describe("isMainEntry — cross-platform entry-point detection [REQ-05]", () => {
  it("posix: matches when argv1 resolves to the module URL", () => {
    const moduleUrl = "file:///Users/king/code/Forge/dist/check-frozen.js";
    const argv1 = "/Users/king/code/Forge/dist/check-frozen.js";
    expect(isMainEntry(moduleUrl, argv1)).toBe(true);
  });

  it("posix: does not match a different module", () => {
    const moduleUrl = "file:///Users/king/code/Forge/dist/check-frozen.js";
    const argv1 = "/Users/king/code/Forge/dist/other-tool.js";
    expect(isMainEntry(moduleUrl, argv1)).toBe(false);
  });

  it("windows: matches despite drive letter + backslashes in argv", () => {
    // import.meta.url on Windows is file:///C:/... (forward slashes, encoded)
    const moduleUrl = "file:///C:/Users/king/Forge/dist/check-frozen.js";
    // process.argv[1] on Windows is typically C:\Users\king\Forge\dist\check-frozen.js
    const argv1 = "C:\\Users\\king\\Forge\\dist\\check-frozen.js";
    expect(isMainEntry(moduleUrl, argv1)).toBe(true);
  });

  it("windows: relative argv path does not resolve (returns false)", () => {
    // isMainEntry does no cwd resolution; a relative argv cannot match an
    // absolute moduleUrl. Pin the concrete result instead of a tautological
    // typeof check.
    const moduleUrl = "file:///C:/Users/king/Forge/dist/check-frozen.js";
    const argv1 = ".\\dist\\check-frozen.js";
    expect(isMainEntry(moduleUrl, argv1)).toBe(false);
  });

  it("handles missing argv1 gracefully", () => {
    const moduleUrl = "file:///Users/king/code/Forge/dist/check-frozen.js";
    expect(isMainEntry(moduleUrl, undefined)).toBe(false);
  });

  it("posix: matches despite URL-encoded spaces in import.meta.url [F-09]", () => {
    // import.meta.url percent-encodes a space as %20; argv carries the raw
    // space. The two must still compare equal.
    const moduleUrl = "file:///Users/my%20user/Forge/dist/check-frozen.js";
    const argv1 = "/Users/my user/Forge/dist/check-frozen.js";
    expect(isMainEntry(moduleUrl, argv1)).toBe(true);
  });
});
