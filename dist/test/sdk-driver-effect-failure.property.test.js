/**
 * Property-based and unit tests for SDK_Driver effect failure propagation.
 *
 * Covers:
 *   - Property 1: Effect failure is recorded in notes
 *   - Property 2: Effect exceptions propagate to iteration result
 *   - Property 3: commitCount reflects only successful commits
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**
 */
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Mock RunManager.persistNotes before importing SdkDriver
vi.mock("../src/run-manager.js", () => ({
    RunManager: {
        persistNotes: vi.fn(),
    },
}));
import { SdkDriver } from "../src/sdk-driver.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createMockUsage(overrides) {
    return {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 10,
        cacheCreationTokens: 5,
        ...overrides,
    };
}
function createSuccessResult() {
    return {
        output: {
            success: true,
            summary: "did stuff",
            key_changes_made: ["change"],
            key_learnings: ["learning"],
        },
        usage: createMockUsage(),
    };
}
function createMockEffectExecutor() {
    return {
        aborted: false,
        stopped: false,
        executeEffect: vi.fn().mockResolvedValue(undefined),
        executeEffects: vi.fn().mockResolvedValue(undefined),
    };
}
function createMockAgent(runImpl) {
    return {
        name: "test-agent",
        run: vi.fn(runImpl ?? (async () => createSuccessResult())),
        close: vi.fn(),
    };
}
function createConfig(overrides) {
    return {
        objective: "Build a login form",
        loopConfig: {
            agent: "claude",
            maxConsecutiveFailures: 3,
            preventSleep: true,
            backoffBaseMs: 60000,
            maxConcurrentWorktrees: 3,
        },
        limits: { maxIterations: 1 },
        cwd: "/test/repo",
        forceNoHooks: true,
        runId: "test-run-id",
        runDir: "/test/repo/.forge/runs/test-run-id/",
        warmQuery: {},
        baseCommit: "abc123",
        notesPath: "/test/repo/.forge/runs/test-run-id/notes.md",
        branchName: "forge/build-a-login-form",
        skillAware: false,
        ...overrides,
    };
}
// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
    vi.clearAllMocks();
});
afterEach(() => {
    vi.restoreAllMocks();
});
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Arbitrary non-empty error message string. */
const errorMessageArb = fc
    .string({ minLength: 1, maxLength: 200 })
    .filter((s) => s.trim().length > 0);
// ---------------------------------------------------------------------------
// Feature: forge-audit-remediation, Property 1: Effect failure is recorded in notes
// ---------------------------------------------------------------------------
describe("Feature: forge-audit-remediation, Property 1: Effect failure is recorded in notes", () => {
    /**
     * **Validates: Requirements 1.1**
     *
     * For any error message thrown by effect executor during commit,
     * notes contain the error message.
     */
    it("for any error message thrown by effect executor during commit, notes contain the error message", async () => {
        await fc.assert(fc.asyncProperty(errorMessageArb, async (errorMsg) => {
            const executor = createMockEffectExecutor();
            const agent = createMockAgent();
            // Make executeEffects throw when it encounters a commit effect.
            executor.executeEffects.mockImplementation(async (effects) => {
                const hasCommit = effects.some((e) => e.type === "commit");
                if (hasCommit) {
                    throw new Error(errorMsg);
                }
            });
            const driver = new SdkDriver(createConfig({ limits: { maxIterations: 1 } }), executor, agent);
            const result = await driver.run();
            // The notes should contain an entry with the error message
            const failedEntries = result.notesDocument.entries.filter((e) => !e.success);
            expect(failedEntries.length).toBeGreaterThanOrEqual(1);
            // At least one failed entry should contain the error message
            const hasErrorInNotes = failedEntries.some((e) => e.summary.includes(errorMsg));
            expect(hasErrorInNotes).toBe(true);
        }), { numRuns: 40 });
    });
    /**
     * **Validates: Requirements 1.2**
     *
     * For any error message thrown during rollback, notes contain
     * the rollback failure info.
     */
    it("for any error message thrown during rollback effect, notes contain the rollback failure info", async () => {
        await fc.assert(fc.asyncProperty(errorMessageArb, async (errorMsg) => {
            const executor = createMockEffectExecutor();
            // Agent returns soft failure so the state machine produces a rollback effect
            const agent = createMockAgent(async () => ({
                output: {
                    success: false,
                    summary: "failed to make progress",
                    key_changes_made: [],
                    key_learnings: [],
                },
                usage: createMockUsage(),
            }));
            // Make executeEffects throw when it encounters a rollback effect
            // from the post-iteration transition (not from failure recovery).
            let rollbackThrowCount = 0;
            executor.executeEffects.mockImplementation(async (effects) => {
                const hasRollback = effects.some((e) => e.type === "rollback");
                if (hasRollback && rollbackThrowCount === 0) {
                    rollbackThrowCount++;
                    throw new Error(errorMsg);
                }
            });
            const driver = new SdkDriver(createConfig({ limits: { maxIterations: 1 } }), executor, agent);
            const result = await driver.run();
            // The notes should contain an entry with the rollback error message
            const failedEntries = result.notesDocument.entries.filter((e) => !e.success);
            expect(failedEntries.length).toBeGreaterThanOrEqual(1);
            // At least one failed entry should contain the error message
            const hasErrorInNotes = failedEntries.some((e) => e.summary.includes(errorMsg));
            expect(hasErrorInNotes).toBe(true);
        }), { numRuns: 40 });
    });
});
// ---------------------------------------------------------------------------
// Feature: forge-audit-remediation, Property 3: commitCount reflects only successful commits
// ---------------------------------------------------------------------------
describe("Feature: forge-audit-remediation, Property 3: commitCount reflects only successful commits", () => {
    /**
     * **Validates: Requirements 1.4**
     *
     * For any sequence of iterations with mixed commit success/failure,
     * commitCount equals successful commits only.
     */
    it("for any sequence of iterations with mixed commit success/failure, commitCount equals successful commits only", async () => {
        // Generate a count of total iterations and how many should fail
        const scenarioArb = fc.record({
            totalIterations: fc.integer({ min: 1, max: 5 }),
            failOnCommitIndices: fc.array(fc.nat({ max: 20 }), { minLength: 0, maxLength: 5 }),
        });
        await fc.assert(fc.asyncProperty(scenarioArb, async ({ totalIterations, failOnCommitIndices }) => {
            const executor = createMockEffectExecutor();
            let commitAttemptIndex = 0;
            let successfulCommits = 0;
            // Convert failOnCommitIndices to a Set for O(1) lookup
            const failSet = new Set(failOnCommitIndices);
            // Agent always reports success
            const agent = createMockAgent(async () => createSuccessResult());
            // Only fail on executeEffects calls that contain a "commit" effect.
            executor.executeEffects.mockImplementation(async (effects) => {
                const hasCommit = effects.some((e) => e.type === "commit");
                if (!hasCommit)
                    return;
                const idx = commitAttemptIndex;
                commitAttemptIndex++;
                if (failSet.has(idx)) {
                    throw new Error(`Commit failed for attempt ${idx}`);
                }
                successfulCommits++;
            });
            const driver = new SdkDriver(createConfig({ limits: { maxIterations: totalIterations } }), executor, agent);
            const result = await driver.run();
            // commitCount should equal only the successful commits
            expect(result.commitCount).toBe(successfulCommits);
        }), { numRuns: 40 });
    });
});
// ---------------------------------------------------------------------------
// Feature: forge-audit-remediation, Property 2: Effect exceptions propagate
// ---------------------------------------------------------------------------
describe("Feature: forge-audit-remediation, Property 2: Effect exceptions propagate to iteration result", () => {
    /**
     * **Validates: Requirements 1.3**
     *
     * Test that executeEffects re-throws exceptions from the effect executor.
     */
    it("executeEffects re-throws exceptions from the effect executor", async () => {
        const executor = createMockEffectExecutor();
        const agent = createMockAgent();
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => { });
        const errorMsg = "git commit failed: permission denied";
        // Make executeEffects throw when it encounters a commit effect.
        executor.executeEffects.mockImplementation(async (effects) => {
            const hasCommit = effects.some((e) => e.type === "commit");
            if (hasCommit) {
                throw new Error(errorMsg);
            }
        });
        const driver = new SdkDriver(createConfig({ limits: { maxIterations: 1 } }), executor, agent);
        const result = await driver.run();
        // The error should have been logged by the executeEffects wrapper (i18n key fallback)
        const allCalls = [...logSpy.mock.calls, ...errSpy.mock.calls].map((c) => c[0]);
        expect(allCalls.some((msg) => msg.includes("driver.loop.effectExecutionFailed"))).toBe(true);
        errSpy.mockRestore();
        // The iteration should be recorded as failed (not silently swallowed)
        const failedEntries = result.notesDocument.entries.filter((e) => !e.success);
        expect(failedEntries.length).toBeGreaterThanOrEqual(1);
        expect(failedEntries.some((e) => e.summary.includes(errorMsg))).toBe(true);
    });
    /**
     * **Validates: Requirements 1.5**
     *
     * Regression test: commit failure does not leave silent inconsistency.
     * When a commit effect fails, the state should reflect the failure
     * (commitCount should not be incremented).
     */
    it("commit failure does not leave silent inconsistency — commitCount not incremented", async () => {
        const executor = createMockEffectExecutor();
        const agent = createMockAgent();
        // Make executeEffects throw when it encounters a commit effect.
        executor.executeEffects.mockImplementation(async (effects) => {
            const hasCommit = effects.some((e) => e.type === "commit");
            if (hasCommit) {
                throw new Error("git commit failed");
            }
        });
        const driver = new SdkDriver(createConfig({ limits: { maxIterations: 1 } }), executor, agent);
        const result = await driver.run();
        // commitCount should be 0 because the commit effect failed.
        // The driver reverts to pre-transition state and dispatches iteration_hard_failure
        // which does NOT increment commitCount.
        expect(result.commitCount).toBe(0);
        // The notes should record the failure
        const failedEntries = result.notesDocument.entries.filter((e) => !e.success);
        expect(failedEntries.length).toBeGreaterThanOrEqual(1);
        expect(failedEntries.some((e) => e.summary.includes("git commit failed"))).toBe(true);
        // The final state should reflect the failure
        expect(result.finalState.failCount).toBeGreaterThanOrEqual(1);
    });
});
//# sourceMappingURL=sdk-driver-effect-failure.property.test.js.map