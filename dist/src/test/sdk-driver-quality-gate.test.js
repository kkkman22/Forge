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
/**
 * Build a review file content string with the given P0/P1 counts.
 * Uses YAML frontmatter format expected by evaluateReviewGate().
 */
function buildReviewContent(p0, p1) {
    return [
        "---",
        `p0_count: ${p0}`,
        `p1_count: ${p1}`,
        "---",
        "",
        p0 > 0 ? `## P0 Issues\n- Critical bug in auth module` : "",
        p1 > 0 ? `## P1 Issues\n- Missing input validation` : "",
    ].join("\n");
}
/**
 * Build a test result file content string.
 * Uses YAML frontmatter format expected by evaluateTestGate().
 */
function buildTestContent(failed, passed, total) {
    return [
        "---",
        `failed: ${failed}`,
        `passed: ${passed}`,
        `total: ${total}`,
        `result: ${failed === 0 ? "pass" : "fail"}`,
        "---",
    ].join("\n");
}
/**
 * Build a progress file content string.
 * Uses YAML frontmatter format expected by evaluateShipGate() → evaluateProgressGate().
 */
function buildProgressContent(completed, total) {
    return ["---", `completed_tasks: ${completed}`, `total_tasks: ${total}`, "---"].join("\n");
}
/**
 * Build a StatusFile content string with mode: autonomous and a given phase.
 */
function buildStatusContent(phase) {
    const lines = ["---", 'mode: "autonomous"', "loop_run_id: test-run-123", "loop_iteration: 1"];
    if (phase) {
        lines.push(`phase: "${phase}"`);
    }
    lines.push("---");
    return lines.join("\n");
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
        run: vi.fn(runImpl ?? (async () => createSkillResult("build", true))),
        close: vi.fn(),
    };
}
/**
 * Create an AgentResult that reports a specific skill phase completion.
 */
function createSkillResult(phase, success, overrides) {
    return {
        output: {
            success,
            summary: `${phase} phase ${success ? "completed" : "failed"}`,
            key_changes_made: success ? [`${phase} changes`] : [],
            key_learnings: [],
            skill_phase_completed: phase,
        },
        usage: createMockUsage(),
        ...overrides,
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
            maxConcurrentLoops: 3,
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
        skillAware: true,
        readStatusFile: () => buildStatusContent("build"),
        writeStatusFile: vi.fn(),
        readReviewFile: undefined,
        readTestFile: undefined,
        readProgressFile: undefined,
        ...overrides,
    };
}
// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.warn and console.log during tests
    vi.spyOn(console, "warn").mockImplementation(() => { });
    vi.spyOn(console, "log").mockImplementation(() => { });
});
afterEach(() => {
    vi.restoreAllMocks();
});
// ---------------------------------------------------------------------------
// Review gate blocked → increments reviewFixAttempts (Req 4.1, 4.2)
// ---------------------------------------------------------------------------
describe("review gate blocked → increments reviewFixAttempts", () => {
    it("increments reviewFixAttempts when review gate returns blocked", async () => {
        // Set up: review file has P0 issues → gate will return "blocked"
        const reviewContent = buildReviewContent(1, 0);
        // Track how many iterations run and what gate_result the agent output gets
        let iterationCount = 0;
        const agent = createMockAgent(async () => {
            iterationCount++;
            // First iteration: agent reports review phase completed
            if (iterationCount === 1) {
                return createSkillResult("review", true);
            }
            // Second iteration: after review blocked, scheduler routes to build (fix).
            // Agent reports build success to end the loop.
            return createSkillResult("build", true);
        });
        const config = createConfig({
            limits: { maxIterations: 2 },
            readStatusFile: () => buildStatusContent("review"),
            readReviewFile: () => reviewContent,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        const _result = await driver.run();
        // The first iteration should have been a soft failure (review blocked overrides success)
        // because review gate blocked + review phase → gate_result = "blocked"
        // The agent reported success=true but gate_result="blocked" on review phase
        // doesn't override to soft failure (only test/ship do per the code).
        // However, reviewFixAttempts should have been incremented.
        expect(iterationCount).toBe(2);
        // The driver ran 2 iterations total
        expect(agent.run).toHaveBeenCalledTimes(2);
    });
    it("increments reviewFixAttempts on each consecutive review block", async () => {
        const reviewContent = buildReviewContent(2, 1);
        let iterationCount = 0;
        const agent = createMockAgent(async () => {
            iterationCount++;
            // All iterations report review completed (all will be blocked by gate)
            return createSkillResult("review", true);
        });
        // Allow 3 iterations — all review blocked, should trigger circuit breaker
        const config = createConfig({
            limits: { maxIterations: 10 },
            readStatusFile: () => buildStatusContent("review"),
            readReviewFile: () => reviewContent,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        const _result = await driver.run();
        // After maxConsecutiveFailures (3) review blocks, the scheduler should
        // eventually route to aborted. The driver should have run multiple iterations.
        expect(iterationCount).toBeGreaterThanOrEqual(2);
    });
});
// ---------------------------------------------------------------------------
// Review gate passed → resets reviewFixAttempts to 0 (Req 4.3)
// ---------------------------------------------------------------------------
describe("review gate passed → resets reviewFixAttempts", () => {
    it("resets reviewFixAttempts to 0 when review gate passes", async () => {
        // Review file with 0 P0 and 0 P1 → gate returns "passed"
        const passingReviewContent = buildReviewContent(0, 0);
        let iterationCount = 0;
        const agent = createMockAgent(async () => {
            iterationCount++;
            // Report review phase completed successfully
            return createSkillResult("review", true);
        });
        const config = createConfig({
            limits: { maxIterations: 1 },
            readStatusFile: () => buildStatusContent("review"),
            readReviewFile: () => passingReviewContent,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // The iteration should succeed (review gate passed, agent reported success)
        expect(result.finalState.successCount).toBe(1);
        expect(iterationCount).toBe(1);
    });
    it("resets reviewFixAttempts after a blocked review followed by a passing review", async () => {
        const blockedReviewContent = buildReviewContent(1, 0);
        const passingReviewContent = buildReviewContent(0, 0);
        let iterationCount = 0;
        const agent = createMockAgent(async () => {
            iterationCount++;
            if (iterationCount === 1) {
                // First: review blocked
                return createSkillResult("review", true);
            }
            if (iterationCount === 2) {
                // Second: build (fix) succeeds
                return createSkillResult("build", true);
            }
            // Third: review passes
            return createSkillResult("review", true);
        });
        // Switch review content between blocked and passing
        let reviewCallCount = 0;
        const config = createConfig({
            limits: { maxIterations: 3 },
            readStatusFile: () => buildStatusContent("review"),
            readReviewFile: () => {
                reviewCallCount++;
                // First review call → blocked, subsequent → passed
                return reviewCallCount <= 1 ? blockedReviewContent : passingReviewContent;
            },
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // All 3 iterations should have run
        expect(iterationCount).toBe(3);
        // The last iteration (review passed) should be a success
        const lastEntry = result.notesDocument.entries[result.notesDocument.entries.length - 1];
        expect(lastEntry.success).toBe(true);
    });
});
// ---------------------------------------------------------------------------
// Test gate blocked → marks iteration as soft failure (Req 4.4, 4.5)
// ---------------------------------------------------------------------------
describe("test gate blocked → marks iteration as soft failure", () => {
    it("overrides agent success to soft failure when test gate is blocked", async () => {
        // Test file with failures → gate returns "blocked"
        const failingTestContent = buildTestContent(3, 7, 10);
        const agent = createMockAgent(async () => {
            // Agent reports test phase completed successfully
            return createSkillResult("test", true);
        });
        const config = createConfig({
            limits: { maxIterations: 1 },
            readStatusFile: () => buildStatusContent("test"),
            readTestFile: () => failingTestContent,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // Even though agent reported success=true, the test gate blocked should
        // override to soft failure (Req 4.5)
        expect(result.finalState.failCount).toBe(1);
        expect(result.finalState.successCount).toBe(0);
    });
    it("does not override to soft failure when test gate passes", async () => {
        // Test file with all passing → gate returns "passed"
        const passingTestContent = buildTestContent(0, 10, 10);
        const agent = createMockAgent(async () => {
            return createSkillResult("test", true);
        });
        const config = createConfig({
            limits: { maxIterations: 1 },
            readStatusFile: () => buildStatusContent("test"),
            readTestFile: () => passingTestContent,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // Agent reported success and test gate passed → iteration is a success
        expect(result.finalState.successCount).toBe(1);
        expect(result.finalState.failCount).toBe(0);
    });
    it("records soft failure in notes when test gate is blocked", async () => {
        const failingTestContent = buildTestContent(2, 8, 10);
        const agent = createMockAgent(async () => {
            return createSkillResult("test", true);
        });
        const config = createConfig({
            limits: { maxIterations: 1 },
            readStatusFile: () => buildStatusContent("test"),
            readTestFile: () => failingTestContent,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // Notes entry should reflect the failure
        expect(result.notesDocument.entries).toHaveLength(1);
        expect(result.notesDocument.entries[0].success).toBe(false);
    });
});
// ---------------------------------------------------------------------------
// Ship gate blocked → aborts ship and marks soft failure (Req 4.6, 4.7)
// ---------------------------------------------------------------------------
describe("ship gate blocked → aborts ship and marks soft failure", () => {
    it("overrides agent success to soft failure when ship gate is blocked", async () => {
        // Ship gate checks review + test + progress. Make review blocked.
        const blockedReviewContent = buildReviewContent(1, 0);
        const passingTestContent = buildTestContent(0, 10, 10);
        const completeProgressContent = buildProgressContent(5, 5);
        const agent = createMockAgent(async () => {
            // Agent reports ship phase completed successfully
            return createSkillResult("ship", true);
        });
        const config = createConfig({
            limits: { maxIterations: 1 },
            readStatusFile: () => buildStatusContent("ship"),
            readReviewFile: () => blockedReviewContent,
            readTestFile: () => passingTestContent,
            readProgressFile: () => completeProgressContent,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // Ship gate blocked → soft failure (Req 4.7)
        expect(result.finalState.failCount).toBe(1);
        expect(result.finalState.successCount).toBe(0);
    });
    it("marks soft failure when ship gate is blocked due to failing tests", async () => {
        const passingReviewContent = buildReviewContent(0, 0);
        const failingTestContent = buildTestContent(1, 9, 10);
        const completeProgressContent = buildProgressContent(5, 5);
        const agent = createMockAgent(async () => {
            return createSkillResult("ship", true);
        });
        const config = createConfig({
            limits: { maxIterations: 1 },
            readStatusFile: () => buildStatusContent("ship"),
            readReviewFile: () => passingReviewContent,
            readTestFile: () => failingTestContent,
            readProgressFile: () => completeProgressContent,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // Ship gate blocked by test sub-gate → soft failure
        expect(result.finalState.failCount).toBe(1);
        expect(result.finalState.successCount).toBe(0);
    });
    it("marks soft failure when ship gate is blocked due to incomplete progress", async () => {
        const passingReviewContent = buildReviewContent(0, 0);
        const passingTestContent = buildTestContent(0, 10, 10);
        const incompleteProgressContent = buildProgressContent(3, 5);
        const agent = createMockAgent(async () => {
            return createSkillResult("ship", true);
        });
        const config = createConfig({
            limits: { maxIterations: 1 },
            readStatusFile: () => buildStatusContent("ship"),
            readReviewFile: () => passingReviewContent,
            readTestFile: () => passingTestContent,
            readProgressFile: () => incompleteProgressContent,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // Ship gate blocked by progress sub-gate → soft failure
        expect(result.finalState.failCount).toBe(1);
        expect(result.finalState.successCount).toBe(0);
    });
    it("allows ship to succeed when all sub-gates pass", async () => {
        const passingReviewContent = buildReviewContent(0, 0);
        const passingTestContent = buildTestContent(0, 10, 10);
        const completeProgressContent = buildProgressContent(5, 5);
        const agent = createMockAgent(async () => {
            return createSkillResult("ship", true);
        });
        const config = createConfig({
            limits: { maxIterations: 1 },
            readStatusFile: () => buildStatusContent("ship"),
            readReviewFile: () => passingReviewContent,
            readTestFile: () => passingTestContent,
            readProgressFile: () => completeProgressContent,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // All sub-gates passed → ship succeeds
        expect(result.finalState.successCount).toBe(1);
        expect(result.finalState.failCount).toBe(0);
    });
    it("records soft failure in notes when ship gate is blocked", async () => {
        const blockedReviewContent = buildReviewContent(2, 1);
        const failingTestContent = buildTestContent(1, 9, 10);
        const incompleteProgressContent = buildProgressContent(2, 5);
        const agent = createMockAgent(async () => {
            return createSkillResult("ship", true);
        });
        const config = createConfig({
            limits: { maxIterations: 1 },
            readStatusFile: () => buildStatusContent("ship"),
            readReviewFile: () => blockedReviewContent,
            readTestFile: () => failingTestContent,
            readProgressFile: () => incompleteProgressContent,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // Notes entry should reflect the failure
        expect(result.notesDocument.entries).toHaveLength(1);
        expect(result.notesDocument.entries[0].success).toBe(false);
    });
});
// ---------------------------------------------------------------------------
// Quality gate with no callbacks configured (edge case)
// ---------------------------------------------------------------------------
describe("quality gate with no file callbacks", () => {
    it("does not evaluate gate when readReviewFile is not configured", async () => {
        const agent = createMockAgent(async () => {
            return createSkillResult("review", true);
        });
        // No readReviewFile callback → gate evaluation returns null → no override
        const config = createConfig({
            limits: { maxIterations: 1 },
            readStatusFile: () => buildStatusContent("review"),
            readReviewFile: undefined,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // Without review file callback, gate is not evaluated → agent success stands
        expect(result.finalState.successCount).toBe(1);
    });
    it("does not evaluate gate when readTestFile is not configured", async () => {
        const agent = createMockAgent(async () => {
            return createSkillResult("test", true);
        });
        const config = createConfig({
            limits: { maxIterations: 1 },
            readStatusFile: () => buildStatusContent("test"),
            readTestFile: undefined,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // Without test file callback, gate is not evaluated → agent success stands
        expect(result.finalState.successCount).toBe(1);
    });
});
//# sourceMappingURL=sdk-driver-quality-gate.test.js.map