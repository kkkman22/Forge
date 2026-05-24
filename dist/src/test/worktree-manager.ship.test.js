/**
 * Tests for Ship delivery worktree cleanup coordination.
 *
 * Covers:
 *   - Property 3: No duplicate branch deletion
 *   - Unit tests: each shipOption value + undefined backward compat
 *
 * **Validates: Requirements 4.1–4.6, 7.2**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decideWorktreeCleanup } from "../src/worktree-manager.js";
// ---------------------------------------------------------------------------
// Property 3: No duplicate branch deletion
// ---------------------------------------------------------------------------
const shipOptionArb = fc.constantFrom("merge", "push-pr", "keep-branch", "discard");
describe("Feature: ship-delivery-unification, Property 3: No duplicate branch deletion", () => {
    it("decideWorktreeCleanup returns consistent actions for all shipOption values", () => {
        fc.assert(fc.property(shipOptionArb, fc.integer({ min: 0, max: 100 }), (shipOption, commitCount) => {
            const result = decideWorktreeCleanup(commitCount, shipOption);
            if (shipOption === "merge" || shipOption === "discard") {
                expect(result.action).toBe("remove");
            }
            if (shipOption === "push-pr" || shipOption === "keep-branch") {
                expect(result.action).toBe("preserve");
            }
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Unit tests: shipOption values
// ---------------------------------------------------------------------------
describe("Feature: ship-delivery-unification, decideWorktreeCleanup with shipOption", () => {
    it("merge → remove (Ship already deleted branch)", () => {
        const result = decideWorktreeCleanup(5, "merge");
        expect(result.action).toBe("remove");
        expect(result.reason).toContain("Ship");
    });
    it("discard → remove (Ship already deleted branch)", () => {
        const result = decideWorktreeCleanup(5, "discard");
        expect(result.action).toBe("remove");
        expect(result.reason).toContain("Ship");
    });
    it("push-pr → preserve (branch still in use)", () => {
        const result = decideWorktreeCleanup(5, "push-pr");
        expect(result.action).toBe("preserve");
        expect(result.reason).toContain("Branch still in use");
    });
    it("keep-branch → preserve (branch kept)", () => {
        const result = decideWorktreeCleanup(5, "keep-branch");
        expect(result.action).toBe("preserve");
        expect(result.reason).toContain("Branch still in use");
    });
});
// ---------------------------------------------------------------------------
// Backward compatibility: undefined shipOption → original behavior
// ---------------------------------------------------------------------------
describe("Feature: ship-delivery-unification, decideWorktreeCleanup backward compat", () => {
    it("undefined shipOption + commitCount > 0 → preserve (original behavior)", () => {
        const result = decideWorktreeCleanup(3);
        expect(result.action).toBe("preserve");
        expect(result.reason).toContain("commit(s)");
    });
    it("undefined shipOption + commitCount = 0 → remove (original behavior)", () => {
        const result = decideWorktreeCleanup(0);
        expect(result.action).toBe("remove");
        expect(result.reason).toContain("no commits");
    });
});
//# sourceMappingURL=worktree-manager.ship.test.js.map