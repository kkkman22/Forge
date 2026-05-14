import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Mock RunManager.persistNotes before importing SdkDriver
vi.mock("../src/run-manager.js", () => ({
    RunManager: {
        persistNotes: vi.fn(),
    },
}));
import { SdkDriver } from "../src/sdk-driver.js";
// ---------------------------------------------------------------------------
// Helpers (matching existing sdk-driver test patterns)
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
function buildStatusContent(fields) {
    const lines = ["---"];
    if (fields) {
        for (const [key, value] of Object.entries(fields)) {
            lines.push(`${key}: ${value}`);
        }
    }
    lines.push("---");
    return lines.join("\n");
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
        skillAware: true,
        readStatusFile: () => buildStatusContent(),
        writeStatusFile: vi.fn(),
        ...overrides,
    };
}
// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------
let consoleLogSpy;
beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => { });
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => { });
});
afterEach(() => {
    vi.restoreAllMocks();
});
// ---------------------------------------------------------------------------
// Normal completion summary (Req 9.1, 9.4, 9.5)
// ---------------------------------------------------------------------------
describe("normal completion summary includes all required fields", () => {
    it("outputs objective, tier, iterations, and branch name on normal completion", async () => {
        const agent = createMockAgent(async () => ({
            output: {
                success: true,
                summary: "build phase completed",
                key_changes_made: ["added login form"],
                key_learnings: [],
                skill_phase_completed: "build",
                should_fully_stop: true,
            },
            usage: createMockUsage(),
        }));
        const config = createConfig({
            objective: "Build a login form",
            presetTier: "standard",
            branchName: "forge/build-a-login-form",
            skillAware: true,
            limits: { maxIterations: 5 },
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        // Find the completion summary in console.log calls
        const logCalls = consoleLogSpy.mock.calls.map((c) => c[0]).join("\n");
        expect(logCalls).toContain("driver.summary.completedTitle");
        expect(logCalls).toContain("driver.summary.objective");
        expect(logCalls).toContain("driver.summary.tier");
        expect(logCalls).toContain("driver.summary.iterations");
        expect(logCalls).toContain("driver.summary.branch");
    });
    it("includes per-phase pass/fail status from notes entries", async () => {
        let callCount = 0;
        const agent = createMockAgent(async () => {
            callCount++;
            if (callCount === 1) {
                return createSkillResult("build", true);
            }
            // Second call: stop
            return {
                output: {
                    success: true,
                    summary: "review phase completed",
                    key_changes_made: [],
                    key_learnings: [],
                    skill_phase_completed: "review",
                    should_fully_stop: true,
                },
                usage: createMockUsage(),
            };
        });
        const config = createConfig({
            skillAware: true,
            limits: { maxIterations: 5 },
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        const logCalls = consoleLogSpy.mock.calls.map((c) => c[0]).join("\n");
        expect(logCalls).toContain("driver.summary.completedTitle");
        expect(logCalls).toContain("driver.summary.phasesHeader");
        expect(logCalls).toContain("driver.summary.phasePassed");
        expect(logCalls).toContain("driver.summary.phasePassed");
    });
    it("uses default tier 'standard' when no preset tier is specified", async () => {
        const agent = createMockAgent(async () => ({
            output: {
                success: true,
                summary: "done",
                key_changes_made: [],
                key_learnings: [],
                should_fully_stop: true,
            },
            usage: createMockUsage(),
        }));
        const config = createConfig({
            skillAware: true,
            presetTier: undefined,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        const logCalls = consoleLogSpy.mock.calls.map((c) => c[0]).join("\n");
        expect(logCalls).toContain("driver.summary.tier");
    });
});
// ---------------------------------------------------------------------------
// Circuit breaker abort summary (Req 9.2)
// ---------------------------------------------------------------------------
describe("abort summary includes P0/P1 issues", () => {
    it("outputs circuit breaker abort with recovery suggestion when review fix attempts exhausted", async () => {
        // Simulate consecutive review failures. The agent reports gate_result: "blocked"
        // which increments reviewFixAttempts. After maxConsecutiveFailures (3) blocked
        // reviews, the summary should indicate circuit breaker abort.
        // We set maxIterations to 3 so the loop stops after 3 blocked reviews.
        const agent = createMockAgent(async () => ({
            output: {
                success: true,
                summary: "review phase completed",
                key_changes_made: [],
                key_learnings: [],
                skill_phase_completed: "review",
                gate_result: "blocked",
            },
            usage: createMockUsage(),
        }));
        // Provide a review file with proper p0_count/p1_count fields for the quality gate
        const reviewContent = [
            "---",
            "result: fail",
            "p0_count: 1",
            "p1_count: 1",
            "---",
            "## P0 Issues",
            "- Hardcoded database password in src/config/db.ts",
            "## P1 Issues",
            "- Missing error handling in src/routes/export.ts",
        ].join("\n");
        const config = createConfig({
            skillAware: true,
            limits: { maxIterations: 3 },
            loopConfig: {
                agent: "claude",
                maxConsecutiveFailures: 3,
                preventSleep: true,
                backoffBaseMs: 60000,
                maxConcurrentWorktrees: 3,
            },
            readReviewFile: () => reviewContent,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        const logCalls = consoleLogSpy.mock.calls.map((c) => c[0]).join("\n");
        expect(logCalls).toContain("driver.summary.circuitBreakerTitle");
        expect(logCalls).toContain("driver.summary.recovery");
    });
});
// ---------------------------------------------------------------------------
// Error abort summary (Req 9.3)
// ---------------------------------------------------------------------------
describe("error summary includes recovery suggestion", () => {
    it("outputs error abort with reason and recovery suggestion when agent throws", async () => {
        const agent = createMockAgent(async () => {
            throw new Error("Agent SDK timeout after 30 minutes");
        });
        const config = createConfig({
            skillAware: true,
            limits: { maxIterations: 1 },
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        const logCalls = consoleLogSpy.mock.calls.map((c) => c[0]).join("\n");
        expect(logCalls).toContain("driver.summary.errorTitle");
        expect(logCalls).toContain("driver.summary.reason");
        expect(logCalls).toContain("driver.summary.recovery");
    });
    it("includes the specific error message in the reason", async () => {
        const agent = createMockAgent(async () => {
            throw new Error("Connection refused");
        });
        const config = createConfig({
            skillAware: true,
            limits: { maxIterations: 1 },
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        const logCalls = consoleLogSpy.mock.calls.map((c) => c[0]).join("\n");
        expect(logCalls).toContain("driver.summary.errorTitle");
        expect(logCalls).toContain("driver.summary.reason");
    });
    it("does not output summary when skillAware is false", async () => {
        const agent = createMockAgent(async () => ({
            output: {
                success: true,
                summary: "done",
                key_changes_made: [],
                key_learnings: [],
                should_fully_stop: true,
            },
            usage: createMockUsage(),
        }));
        const config = createConfig({
            skillAware: false,
            limits: { maxIterations: 1 },
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        const logCalls = consoleLogSpy.mock.calls.map((c) => c[0]).join("\n");
        // Should not contain any completion summary markers
        expect(logCalls).not.toContain("driver.summary.completedTitle");
        expect(logCalls).not.toContain("driver.summary.circuitBreakerTitle");
        expect(logCalls).not.toContain("driver.summary.errorTitle");
    });
});
//# sourceMappingURL=sdk-driver-completion-summary.test.js.map