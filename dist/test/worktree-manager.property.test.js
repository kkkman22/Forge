/**
 * Property-based tests for the worktree manager module.
 *
 * Covers:
 *   - Property 15: Worktree 路径计算
 *   - Property 16: Worktree 清理决策
 *   - Property 17: Worktree 并发限制
 *   - Property 18: Worktree 源分支校验
 *
 * **Validates: Requirements 7.1, 7.3, 7.4, 7.5, 7.7**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canCreateWorktree, computeWorktreeDir, computeWorktreePath, decideWorktreeCleanup, isValidWorktreeSource, } from "../src/worktree-manager.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Arbitrary path segment: 1–20 alphanumeric/hyphen/underscore characters. */
const pathSegmentArb = fc
    .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
    minLength: 1,
    maxLength: 20,
})
    .map((chars) => chars.join(""));
/**
 * Arbitrary absolute repo root path like `/home/user/myrepo`.
 * Always starts with `/`, has at least a parent and basename component,
 * and never contains `..`.
 */
const repoRootArb = fc
    .array(pathSegmentArb, { minLength: 2, maxLength: 5 })
    .map((segments) => `/${segments.join("/")}`);
/**
 * Arbitrary slug: alphanumeric strings with hyphens, safe for path use.
 * Does not contain `..`, `/`, or other path-unsafe characters.
 */
const slugArb = fc
    .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
    minLength: 1,
    maxLength: 30,
})
    .map((chars) => chars.join(""));
/** Arbitrary non-negative commit count. */
const commitCountArb = fc.nat({ max: 1000 });
/** Arbitrary non-negative active worktree count. */
const activeCountArb = fc.nat({ max: 100 });
/** Arbitrary positive max concurrent limit. */
const maxConcurrentArb = fc.integer({ min: 1, max: 50 });
/** Arbitrary branch name that starts with "forge/". */
const forgeBranchArb = fc
    .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
    minLength: 1,
    maxLength: 30,
})
    .map((chars) => `forge/${chars.join("")}`);
/** Arbitrary branch name that does NOT start with "forge/". */
const nonForgeBranchArb = fc
    .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
    minLength: 1,
    maxLength: 30,
})
    .map((chars) => chars.join(""))
    .filter((s) => !s.startsWith("forge/"));
// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 15: Worktree 路径计算
// ---------------------------------------------------------------------------
describe("Feature: gnhf-inspired-enhancements, Property 15: Worktree 路径计算", () => {
    /**
     * **Validates: Requirements 7.1**
     */
    it("computeWorktreePath returns <parent(R)>/<basename(R)>-forge-worktrees/<S>/ format", () => {
        fc.assert(fc.property(repoRootArb, slugArb, (repoRoot, slug) => {
            const result = computeWorktreePath(repoRoot, slug);
            // Extract parent and basename from the repo root
            const lastSlash = repoRoot.lastIndexOf("/");
            const parent = repoRoot.slice(0, lastSlash) || "/";
            const basename = repoRoot.slice(lastSlash + 1);
            const expected = `${parent}/${basename}-forge-worktrees/${slug}/`;
            expect(result).toBe(expected);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 7.1**
     */
    it("computeWorktreePath result does not contain path traversal patterns", () => {
        fc.assert(fc.property(repoRootArb, slugArb, (repoRoot, slug) => {
            const result = computeWorktreePath(repoRoot, slug);
            expect(result).not.toContain("..");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 7.1**
     */
    it("computeWorktreeDir returns <parent(R)>/<basename(R)>-forge-worktrees/ format", () => {
        fc.assert(fc.property(repoRootArb, (repoRoot) => {
            const result = computeWorktreeDir(repoRoot);
            const lastSlash = repoRoot.lastIndexOf("/");
            const parent = repoRoot.slice(0, lastSlash) || "/";
            const basename = repoRoot.slice(lastSlash + 1);
            const expected = `${parent}/${basename}-forge-worktrees/`;
            expect(result).toBe(expected);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 7.1**
     */
    it("computeWorktreePath result ends with trailing slash", () => {
        fc.assert(fc.property(repoRootArb, slugArb, (repoRoot, slug) => {
            const result = computeWorktreePath(repoRoot, slug);
            expect(result.endsWith("/")).toBe(true);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 7.1**
     */
    it("computeWorktreePath contains the -forge-worktrees suffix", () => {
        fc.assert(fc.property(repoRootArb, slugArb, (repoRoot, slug) => {
            const result = computeWorktreePath(repoRoot, slug);
            expect(result).toContain("-forge-worktrees/");
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 16: Worktree 清理决策
// ---------------------------------------------------------------------------
describe("Feature: gnhf-inspired-enhancements, Property 16: Worktree 清理决策", () => {
    /**
     * **Validates: Requirements 7.3, 7.4**
     */
    it("commitCount > 0 results in preserve action", () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 1000 }), (commitCount) => {
            const decision = decideWorktreeCleanup(commitCount);
            expect(decision.action).toBe("preserve");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 7.3, 7.4**
     */
    it("commitCount === 0 results in remove action", () => {
        const decision = decideWorktreeCleanup(0);
        expect(decision.action).toBe("remove");
    });
    /**
     * **Validates: Requirements 7.3, 7.4**
     */
    it("decision always includes a non-empty reason string", () => {
        fc.assert(fc.property(commitCountArb, (commitCount) => {
            const decision = decideWorktreeCleanup(commitCount);
            expect(typeof decision.reason).toBe("string");
            expect(decision.reason.length).toBeGreaterThan(0);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 7.3, 7.4**
     */
    it("action is always either preserve or remove", () => {
        fc.assert(fc.property(commitCountArb, (commitCount) => {
            const decision = decideWorktreeCleanup(commitCount);
            expect(["preserve", "remove"]).toContain(decision.action);
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 17: Worktree 并发限制
// ---------------------------------------------------------------------------
describe("Feature: gnhf-inspired-enhancements, Property 17: Worktree 并发限制", () => {
    /**
     * **Validates: Requirements 7.5**
     */
    it("canCreateWorktree returns true iff activeCount < maxConcurrent", () => {
        fc.assert(fc.property(activeCountArb, maxConcurrentArb, (activeCount, maxConcurrent) => {
            const result = canCreateWorktree(activeCount, maxConcurrent);
            expect(result).toBe(activeCount < maxConcurrent);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 7.5**
     */
    it("canCreateWorktree with default maxConcurrent uses 3", () => {
        fc.assert(fc.property(activeCountArb, (activeCount) => {
            const result = canCreateWorktree(activeCount);
            expect(result).toBe(activeCount < 3);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 7.5**
     */
    it("exactly at maxConcurrent returns false", () => {
        fc.assert(fc.property(maxConcurrentArb, (maxConcurrent) => {
            expect(canCreateWorktree(maxConcurrent, maxConcurrent)).toBe(false);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 7.5**
     */
    it("one below maxConcurrent returns true", () => {
        fc.assert(fc.property(fc.integer({ min: 2, max: 50 }), (maxConcurrent) => {
            expect(canCreateWorktree(maxConcurrent - 1, maxConcurrent)).toBe(true);
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 18: Worktree 源分支校验
// ---------------------------------------------------------------------------
describe("Feature: gnhf-inspired-enhancements, Property 18: Worktree 源分支校验", () => {
    /**
     * **Validates: Requirements 7.7**
     */
    it("branches starting with forge/ return false", () => {
        fc.assert(fc.property(forgeBranchArb, (branch) => {
            expect(isValidWorktreeSource(branch)).toBe(false);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 7.7**
     */
    it("branches not starting with forge/ return true", () => {
        fc.assert(fc.property(nonForgeBranchArb, (branch) => {
            expect(isValidWorktreeSource(branch)).toBe(true);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 7.7**
     */
    it("common non-forge branches are valid sources", () => {
        for (const branch of ["main", "master", "develop", "feature/my-feature", "release/1.0"]) {
            expect(isValidWorktreeSource(branch)).toBe(true);
        }
    });
    /**
     * **Validates: Requirements 7.7**
     */
    it("forge/ prefix is case-sensitive (Forge/ is valid)", () => {
        expect(isValidWorktreeSource("Forge/something")).toBe(true);
        expect(isValidWorktreeSource("FORGE/something")).toBe(true);
        expect(isValidWorktreeSource("forge/something")).toBe(false);
    });
});
//# sourceMappingURL=worktree-manager.property.test.js.map