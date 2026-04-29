import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Mock RunManager.persistNotes before importing SdkDriver
vi.mock("../src/run-manager.js", () => ({
    RunManager: {
        persistNotes: vi.fn(),
    },
}));
import { SdkDriver } from "../src/sdk-driver.js";
// ---------------------------------------------------------------------------
// Helpers (matching sdk-driver-quality-gate.test.ts patterns)
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
/**
 * Build a StatusFile content string with optional fields.
 */
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
beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => { });
    vi.spyOn(console, "log").mockImplementation(() => { });
});
afterEach(() => {
    vi.restoreAllMocks();
});
// ---------------------------------------------------------------------------
// Startup writes all Loop fields correctly (Req 6.1)
// ---------------------------------------------------------------------------
describe("startup writes all Loop fields correctly", () => {
    it("writes mode, loop_run_id, loop_iteration, and skill_sequence on startup", async () => {
        const writtenContents = [];
        const writeStatusFile = vi.fn((content) => {
            writtenContents.push(content);
        });
        const agent = createMockAgent(async () => {
            return {
                output: {
                    success: true,
                    summary: "done",
                    key_changes_made: [],
                    key_learnings: [],
                    should_fully_stop: true,
                },
                usage: createMockUsage(),
            };
        });
        const config = createConfig({
            runId: "my-unique-run-id",
            skillAware: true,
            readStatusFile: () => buildStatusContent(),
            writeStatusFile,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        // The first writeStatusFile call should be the startup initialization
        expect(writtenContents.length).toBeGreaterThanOrEqual(1);
        const startupContent = writtenContents[0];
        // Verify all Loop fields are present
        expect(startupContent).toContain('mode: "autonomous"');
        expect(startupContent).toContain('loop_run_id: "my-unique-run-id"');
        expect(startupContent).toContain("loop_iteration: 0");
        expect(startupContent).toContain("skill_sequence:");
    });
    it("writes skill_sequence based on the preset tier", async () => {
        const writtenContents = [];
        const writeStatusFile = vi.fn((content) => {
            writtenContents.push(content);
        });
        const agent = createMockAgent(async () => {
            return {
                output: {
                    success: true,
                    summary: "done",
                    key_changes_made: [],
                    key_learnings: [],
                    should_fully_stop: true,
                },
                usage: createMockUsage(),
            };
        });
        const config = createConfig({
            skillAware: true,
            presetTier: "light",
            readStatusFile: () => buildStatusContent(),
            writeStatusFile,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        const startupContent = writtenContents[0];
        // Light tier sequence is ["build", "review"]
        expect(startupContent).toContain("skill_sequence:");
        expect(startupContent).toMatch(/build/);
        expect(startupContent).toMatch(/review/);
    });
    it("does not write Loop fields when skillAware is false", async () => {
        const writeStatusFile = vi.fn();
        const agent = createMockAgent(async () => {
            return {
                output: {
                    success: true,
                    summary: "done",
                    key_changes_made: [],
                    key_learnings: [],
                    should_fully_stop: true,
                },
                usage: createMockUsage(),
            };
        });
        const config = createConfig({
            skillAware: false,
            readStatusFile: () => buildStatusContent(),
            writeStatusFile,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        // writeStatusFile should not be called at all when skillAware is false
        expect(writeStatusFile).not.toHaveBeenCalled();
    });
});
// ---------------------------------------------------------------------------
// Normal completion clears all Loop fields (Req 6.3)
// ---------------------------------------------------------------------------
describe("normal completion clears all Loop fields", () => {
    it("clears mode, loop_run_id, loop_iteration, and skill_sequence on normal completion", async () => {
        const writtenContents = [];
        const writeStatusFile = vi.fn((content) => {
            writtenContents.push(content);
        });
        // StatusFile starts with Loop fields (simulating mid-run state)
        const statusWithLoopFields = buildStatusContent({
            mode: '"autonomous"',
            loop_run_id: '"test-run-id"',
            loop_iteration: "3",
            skill_sequence: '"plan,build,review,test,ship"',
            phase: '"build"',
            current_task: '"some task"',
        });
        const agent = createMockAgent(async () => {
            return {
                output: {
                    success: true,
                    summary: "all done",
                    key_changes_made: [],
                    key_learnings: [],
                    should_fully_stop: true,
                },
                usage: createMockUsage(),
            };
        });
        const config = createConfig({
            skillAware: true,
            readStatusFile: () => statusWithLoopFields,
            writeStatusFile,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        // The last writeStatusFile call should be the cleanup
        const lastContent = writtenContents[writtenContents.length - 1];
        // All Loop fields should be cleared
        expect(lastContent).not.toMatch(/^mode:\s/m);
        expect(lastContent).not.toMatch(/^loop_run_id:\s/m);
        expect(lastContent).not.toMatch(/^loop_iteration:\s/m);
        expect(lastContent).not.toMatch(/^skill_sequence:\s/m);
        // Non-Loop fields should be preserved
        expect(lastContent).toContain("current_task:");
    });
});
// ---------------------------------------------------------------------------
// Abnormal exit preserves phase field (Req 6.4)
// ---------------------------------------------------------------------------
describe("abnormal exit preserves phase field", () => {
    it("preserves phase field when loop exits due to error", async () => {
        const writtenContents = [];
        const writeStatusFile = vi.fn((content) => {
            writtenContents.push(content);
        });
        const statusWithPhase = buildStatusContent({
            mode: '"autonomous"',
            loop_run_id: '"test-run-id"',
            loop_iteration: "2",
            skill_sequence: '"plan,build,review,test,ship"',
            phase: '"build"',
        });
        // Agent throws an error to simulate abnormal exit
        const agent = createMockAgent(async () => {
            throw new Error("Agent SDK timeout");
        });
        const config = createConfig({
            skillAware: true,
            limits: { maxIterations: 1 },
            readStatusFile: () => statusWithPhase,
            writeStatusFile,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        // The last writeStatusFile call should be the cleanup on abnormal exit
        const lastContent = writtenContents[writtenContents.length - 1];
        // Phase should be preserved (phase is not a Loop field, so clearLoopFields keeps it)
        expect(lastContent).toContain("phase:");
        // Loop fields (mode, loop_run_id, loop_iteration) should be cleared
        expect(lastContent).not.toMatch(/^mode:\s/m);
        expect(lastContent).not.toMatch(/^loop_run_id:\s/m);
        expect(lastContent).not.toMatch(/^loop_iteration:\s/m);
    });
    it("preserves skill_sequence on abnormal exit for potential resume", async () => {
        const writtenContents = [];
        const writeStatusFile = vi.fn((content) => {
            writtenContents.push(content);
        });
        const statusWithPhase = buildStatusContent({
            mode: '"autonomous"',
            loop_run_id: '"test-run-id"',
            loop_iteration: "2",
            skill_sequence: '"plan,build,review,test,ship"',
            phase: '"build"',
        });
        // Agent throws to trigger abnormal exit
        const agent = createMockAgent(async () => {
            throw new Error("Agent SDK timeout");
        });
        const config = createConfig({
            skillAware: true,
            limits: { maxIterations: 1 },
            readStatusFile: () => statusWithPhase,
            writeStatusFile,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        // The last writeStatusFile call should preserve skill_sequence
        const lastContent = writtenContents[writtenContents.length - 1];
        expect(lastContent).toContain("skill_sequence:");
    });
});
// ---------------------------------------------------------------------------
// Residual state detection and cleanup (Req 6.5, 10.5)
// ---------------------------------------------------------------------------
describe("residual state detection and cleanup", () => {
    it("clears residual loop_run_id before writing new fields", async () => {
        const writtenContents = [];
        const writeStatusFile = vi.fn((content) => {
            writtenContents.push(content);
        });
        // StatusFile has residual Loop state from a previous run
        const statusWithResidual = buildStatusContent({
            mode: '"autonomous"',
            loop_run_id: '"old-run-id-from-crash"',
            loop_iteration: "7",
            skill_sequence: '"plan,build,review"',
            phase: '"review"',
            current_task: '"existing task"',
        });
        const agent = createMockAgent(async () => {
            return {
                output: {
                    success: true,
                    summary: "done",
                    key_changes_made: [],
                    key_learnings: [],
                    should_fully_stop: true,
                },
                usage: createMockUsage(),
            };
        });
        const config = createConfig({
            runId: "new-fresh-run-id",
            skillAware: true,
            readStatusFile: () => statusWithResidual,
            writeStatusFile,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        // The first writeStatusFile call (startup) should have the NEW run id, not the old one
        const startupContent = writtenContents[0];
        expect(startupContent).toContain('loop_run_id: "new-fresh-run-id"');
        expect(startupContent).not.toContain("old-run-id-from-crash");
        // Should start with iteration 0 (fresh start)
        expect(startupContent).toContain("loop_iteration: 0");
    });
    it("preserves non-Loop fields when cleaning residual state", async () => {
        const writtenContents = [];
        const writeStatusFile = vi.fn((content) => {
            writtenContents.push(content);
        });
        const statusWithResidual = buildStatusContent({
            mode: '"autonomous"',
            loop_run_id: '"old-run-id"',
            loop_iteration: "5",
            phase: '"build"',
            current_task: '"important task"',
            tier: '"standard"',
        });
        const agent = createMockAgent(async () => {
            return {
                output: {
                    success: true,
                    summary: "done",
                    key_changes_made: [],
                    key_learnings: [],
                    should_fully_stop: true,
                },
                usage: createMockUsage(),
            };
        });
        const config = createConfig({
            runId: "new-run-id",
            skillAware: true,
            readStatusFile: () => statusWithResidual,
            writeStatusFile,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        // The startup write should preserve non-Loop fields
        const startupContent = writtenContents[0];
        expect(startupContent).toContain("phase:");
        expect(startupContent).toContain("current_task:");
        expect(startupContent).toContain("tier:");
    });
});
// ---------------------------------------------------------------------------
// Iteration updates loop_iteration and phase (Req 6.2)
// ---------------------------------------------------------------------------
describe("iteration updates loop_iteration and phase", () => {
    it("updates loop_iteration and phase after each iteration", async () => {
        const writtenContents = [];
        const writeStatusFile = vi.fn((content) => {
            writtenContents.push(content);
        });
        const agent = createMockAgent(async () => {
            return createSkillResult("build", true);
        });
        const config = createConfig({
            skillAware: true,
            limits: { maxIterations: 1 },
            readStatusFile: () => buildStatusContent({
                mode: '"autonomous"',
                loop_run_id: '"test-run-id"',
                loop_iteration: "0",
                phase: '"router"',
            }),
            writeStatusFile,
        });
        const executor = createMockEffectExecutor();
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        // There should be at least one write that updates iteration status
        // (beyond the startup write and the cleanup write)
        const iterationUpdates = writtenContents.filter((content) => content.includes("loop_iteration:") && content.includes("phase:"));
        expect(iterationUpdates.length).toBeGreaterThanOrEqual(1);
    });
});
//# sourceMappingURL=sdk-driver-statusfile-lifecycle.test.js.map