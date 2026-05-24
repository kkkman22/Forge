/**
 * Property-based tests for countActiveWorktrees.
 *
 * Validates porcelain output parsing for active worktree counting.
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { countActiveWorktrees } from "../src/worktree-manager.js";
describe("countActiveWorktrees", () => {
    it("returns 0 for empty porcelain output", () => {
        expect(countActiveWorktrees("")).toBe(0);
    });
    it("returns 0 for whitespace-only output", () => {
        expect(countActiveWorktrees("   \n  \n")).toBe(0);
    });
    it("returns 0 for single main worktree", () => {
        const output = "worktree /repo/main\nbranch main";
        expect(countActiveWorktrees(output)).toBe(0);
    });
    it("counts 1 additional worktree", () => {
        const output = "worktree /repo/main\nbranch main\n\nworktree /repo/feat\nbranch feat";
        expect(countActiveWorktrees(output)).toBe(1);
    });
    it("counts 2 additional worktrees", () => {
        const output = "worktree /repo/main\nbranch main\n\nworktree /repo/feat-a\nbranch feat-a\n\nworktree /repo/feat-b\nbranch feat-b";
        expect(countActiveWorktrees(output)).toBe(2);
    });
    // Property: result is always >= 0
    it("never returns negative", () => {
        fc.assert(fc.property(fc.string(), (output) => {
            const count = countActiveWorktrees(output);
            expect(count).toBeGreaterThanOrEqual(0);
        }));
    });
    // Property: more worktree lines → higher count
    it("count increases with more worktree entries", () => {
        const single = "worktree /a\nbranch a";
        const double = "worktree /a\nbranch a\n\nworktree /b\nbranch b";
        expect(countActiveWorktrees(double)).toBeGreaterThan(countActiveWorktrees(single));
    });
});
//# sourceMappingURL=worktree-manager-count.property.test.js.map