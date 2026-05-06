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
import { isHardFrozenSourceFile } from "../src/check-frozen.js";
describe("isHardFrozenSourceFile", () => {
    it("flags the prompt-defense pattern library", () => {
        expect(isHardFrozenSourceFile("src/prompt-defense-patterns.ts")).toBe(true);
    });
    it("matches absolute paths", () => {
        expect(isHardFrozenSourceFile("/Users/king/code/Forge/src/prompt-defense-patterns.ts")).toBe(true);
    });
    it("matches worktree-nested paths", () => {
        expect(isHardFrozenSourceFile(".claude/worktrees/foo/src/prompt-defense-patterns.ts")).toBe(true);
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
//# sourceMappingURL=check-frozen-source.test.js.map