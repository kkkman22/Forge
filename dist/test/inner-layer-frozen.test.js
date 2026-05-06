/**
 * Unit tests and property test for inner-layer frozen zone check.
 *
 * Verifies that the inner-layer check in `effect-executor.ts` blocks
 * commits independently of the Hook layer, and produces the same
 * judgment as the outer-layer check in `check-frozen.ts`.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
 */
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Mock node:child_process before importing the module under test
vi.mock("node:child_process", () => ({
    execFileSync: vi.fn(),
}));
import { execFileSync } from "node:child_process";
import { EffectExecutor, FrozenZoneViolation, } from "../src/effect-executor.js";
import { checkWritePermission, getProtectionZone, normalizeForgePath } from "../src/state.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createDeps(overrides) {
    return {
        cwd: "/test/repo",
        onNotesUpdate: vi.fn(),
        onLog: vi.fn(),
        ...overrides,
    };
}
function createExecutor(overrides) {
    return new EffectExecutor(createDeps(overrides));
}
/**
 * Set up the execFileSync mock to simulate staged files.
 *
 * @param stagedFiles - Map of file path → file content (for git show)
 *                      If content is null, git show will throw (simulating failure)
 */
function setupStagedFilesMock(stagedFiles) {
    const filePaths = Object.keys(stagedFiles);
    const diffOutput = filePaths.join("\n");
    const mock = execFileSync;
    mock.mockImplementation((_exec, args) => {
        if (args[0] === "diff") {
            return Buffer.from(diffOutput ? `${diffOutput}\n` : "");
        }
        if (args[0] === "show") {
            // Extract file path from `:filepath` format
            const showArg = args[1]; // e.g. ":.forge/specs/feature/spec.md"
            const filePath = showArg.startsWith(":") ? showArg.slice(1) : showArg;
            const content = stagedFiles[filePath];
            if (content === null) {
                throw new Error(`fatal: path '${filePath}' does not exist in index`);
            }
            return Buffer.from(content);
        }
        // add, reset, commit — return empty buffer
        return Buffer.from("");
    });
}
/**
 * Simulate the outer-layer check-frozen.ts judgment for a given path and content.
 *
 * This replicates the logic from check-frozen.ts:
 *   1. normalizeForgePath → getProtectionZone → is it frozen?
 *   2. If frozen, check status via checkWritePermission
 */
function outerLayerJudgment(filePath, content) {
    const relativePath = normalizeForgePath(filePath);
    const zone = getProtectionZone(relativePath);
    if (zone !== "frozen")
        return false;
    const result = checkWritePermission(relativePath, content);
    return result.blocked;
}
// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
    vi.clearAllMocks();
});
afterEach(() => {
    vi.clearAllMocks();
});
// ---------------------------------------------------------------------------
// Task 5.4: Unit tests for inner-layer frozen check
// ---------------------------------------------------------------------------
describe("inner-layer frozen check — unit tests", () => {
    /**
     * Test: locked status file is blocked by inner-layer check
     * **Validates: Requirements 5.3**
     */
    it("locked status file is blocked by inner-layer check", async () => {
        const onLog = vi.fn();
        const executor = createExecutor({ onLog });
        setupStagedFilesMock({
            ".forge/specs/feature/spec.md": "---\nstatus: locked\n---\n# Spec content",
        });
        try {
            await executor.executeEffect({ type: "commit", message: "test commit" });
            expect.unreachable("Expected FrozenZoneViolation to be thrown");
        }
        catch (err) {
            expect(err).toBeInstanceOf(FrozenZoneViolation);
            expect(err.files).toContain(".forge/specs/feature/spec.md");
            expect(err.code).toBe("FROZEN_ZONE_VIOLATION");
        }
        expect(onLog).toHaveBeenCalledWith(expect.stringContaining("Inner-layer frozen zone check blocked commit"));
        expect(onLog).toHaveBeenCalledWith(expect.stringContaining(".forge/specs/feature/spec.md"));
    });
    /**
     * Test: approved status file is blocked by inner-layer check
     * **Validates: Requirements 5.3**
     */
    it("approved status file is blocked by inner-layer check", async () => {
        const onLog = vi.fn();
        const executor = createExecutor({ onLog });
        setupStagedFilesMock({
            ".forge/plans/my-plan.md": "---\nstatus: approved\n---\n# Plan content",
        });
        try {
            await executor.executeEffect({ type: "commit", message: "test commit" });
            expect.unreachable("Expected FrozenZoneViolation to be thrown");
        }
        catch (err) {
            expect(err).toBeInstanceOf(FrozenZoneViolation);
            expect(err.files).toContain(".forge/plans/my-plan.md");
        }
        expect(onLog).toHaveBeenCalledWith(expect.stringContaining("Inner-layer frozen zone check blocked commit"));
        expect(onLog).toHaveBeenCalledWith(expect.stringContaining(".forge/plans/my-plan.md"));
    });
    /**
     * Test: git show failure results in warning log and file treated as suspicious
     * **Validates: Requirements 5.4**
     */
    it("git show failure results in warning log and file treated as suspicious", async () => {
        const onLog = vi.fn();
        const executor = createExecutor({ onLog });
        // null content means git show will throw
        setupStagedFilesMock({
            ".forge/specs/broken/spec.md": null,
        });
        try {
            await executor.executeEffect({ type: "commit", message: "test commit" });
            expect.unreachable("Expected FrozenZoneViolation to be thrown");
        }
        catch (err) {
            expect(err).toBeInstanceOf(FrozenZoneViolation);
            expect(err.files).toContain(".forge/specs/broken/spec.md");
        }
        // Should log a warning about the failed git show
        expect(onLog).toHaveBeenCalledWith("⚠️ Could not read staged version of .forge/specs/broken/spec.md — treating as suspicious");
        // Should also log the blocked commit message (file was added to violations)
        expect(onLog).toHaveBeenCalledWith(expect.stringContaining("Inner-layer frozen zone check blocked commit"));
        expect(onLog).toHaveBeenCalledWith(expect.stringContaining(".forge/specs/broken/spec.md"));
    });
    it("draft status file in frozen zone is NOT blocked", async () => {
        const onLog = vi.fn();
        const executor = createExecutor({ onLog });
        setupStagedFilesMock({
            ".forge/specs/feature/spec.md": "---\nstatus: draft\n---\n# Draft spec",
        });
        await executor.executeEffect({ type: "commit", message: "test commit" });
        // Should NOT log a blocked message — draft files are allowed
        const blockedCalls = onLog.mock.calls.filter((call) => typeof call[0] === "string" && call[0].includes("Inner-layer frozen zone check blocked"));
        expect(blockedCalls).toHaveLength(0);
    });
    it("non-.forge/ files are not checked by inner-layer", async () => {
        const onLog = vi.fn();
        const executor = createExecutor({ onLog });
        setupStagedFilesMock({
            "src/main.ts": "console.log('hello');",
            "README.md": "# README",
        });
        await executor.executeEffect({ type: "commit", message: "test commit" });
        // No frozen zone warnings
        const warningCalls = onLog.mock.calls.filter((call) => typeof call[0] === "string" && call[0].includes("frozen zone"));
        expect(warningCalls).toHaveLength(0);
    });
});
// ---------------------------------------------------------------------------
// Task 5.3: Property 7 — Inner/outer layer consistency
// ---------------------------------------------------------------------------
describe("Property 7: Inner-layer and outer-layer frozen zone checks are consistent", () => {
    /** Frozen zone relative paths (relative to .forge/) */
    const frozenRelativePathArb = fc.oneof(fc
        .tuple(fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/), fc.stringMatching(/^[a-z][a-z0-9-]{0,15}\.md$/))
        .map(([dir, file]) => `specs/${dir}/${file}`), fc.stringMatching(/^[a-z][a-z0-9-]{0,15}\.md$/).map((f) => `plans/${f}`), fc.constant("config.md"));
    /** Non-frozen zone relative paths */
    const nonFrozenRelativePathArb = fc.oneof(fc.constant("progress/topic.md"), fc.constant("reviews/review.md"), fc.constant("knowledge/instincts.md"), fc.stringMatching(/^[a-z][a-z0-9-]{0,15}\.md$/).map((f) => `scratch/${f}`));
    /** Status values that trigger blocking */
    const frozenStatusArb = fc.oneof(fc.constant("locked"), fc.constant("approved"));
    /** Status values that do NOT trigger blocking */
    const nonFrozenStatusArb = fc.oneof(fc.constant("draft"), fc.constant("in-progress"), fc.constant("review"));
    /** Generate frontmatter content with a given status */
    function makeFrontmatter(status) {
        return `---\nstatus: ${status}\n---\n# Content`;
    }
    /**
     * Property: for any .forge/ path and content, inner-layer and outer-layer
     * checks produce the same judgment.
     *
     * **Validates: Requirements 5.1**
     */
    it("frozen zone path with frozen status: inner-layer matches outer-layer", () => {
        fc.assert(fc.property(frozenRelativePathArb, frozenStatusArb, (relativePath, status) => {
            const filePath = `.forge/${relativePath}`;
            const content = makeFrontmatter(status);
            // Outer-layer judgment (check-frozen.ts logic)
            const outerBlocked = outerLayerJudgment(filePath, content);
            // Inner-layer judgment (effect-executor.ts logic)
            const forgePath = normalizeForgePath(filePath);
            const innerResult = checkWritePermission(forgePath, content);
            expect(innerResult.blocked).toBe(outerBlocked);
            // Both should be blocked for frozen status in frozen zone
            expect(outerBlocked).toBe(true);
        }), { numRuns: 50 });
    });
    it("frozen zone path with non-frozen status: inner-layer matches outer-layer", () => {
        fc.assert(fc.property(frozenRelativePathArb, nonFrozenStatusArb, (relativePath, status) => {
            const filePath = `.forge/${relativePath}`;
            const content = makeFrontmatter(status);
            const outerBlocked = outerLayerJudgment(filePath, content);
            const forgePath = normalizeForgePath(filePath);
            const innerResult = checkWritePermission(forgePath, content);
            expect(innerResult.blocked).toBe(outerBlocked);
            // Both should NOT be blocked for non-frozen status
            expect(outerBlocked).toBe(false);
        }), { numRuns: 50 });
    });
    it("non-frozen zone path: inner-layer matches outer-layer (never blocked)", () => {
        fc.assert(fc.property(nonFrozenRelativePathArb, frozenStatusArb, (relativePath, status) => {
            const filePath = `.forge/${relativePath}`;
            const content = makeFrontmatter(status);
            const outerBlocked = outerLayerJudgment(filePath, content);
            const forgePath = normalizeForgePath(filePath);
            const innerResult = checkWritePermission(forgePath, content);
            expect(innerResult.blocked).toBe(outerBlocked);
            // Non-frozen zone paths are never blocked
            expect(outerBlocked).toBe(false);
        }), { numRuns: 40 });
    });
    it("path variants produce consistent inner/outer judgments", () => {
        fc.assert(fc.property(frozenRelativePathArb, frozenStatusArb, (relativePath, status) => {
            const content = makeFrontmatter(status);
            // Test multiple path variants
            const variants = [
                `.forge/${relativePath}`,
                `/abs/path/.forge/${relativePath}`,
                `./.forge/${relativePath}`,
                `.forge//${relativePath}`,
            ];
            for (const variant of variants) {
                const outerBlocked = outerLayerJudgment(variant, content);
                const forgePath = normalizeForgePath(variant);
                const innerResult = checkWritePermission(forgePath, content);
                expect(innerResult.blocked).toBe(outerBlocked);
            }
        }), { numRuns: 40 });
    });
});
//# sourceMappingURL=inner-layer-frozen.test.js.map