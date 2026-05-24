import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// ---------------------------------------------------------------------------
// Mocks — must be declared before importing modules under test
// ---------------------------------------------------------------------------
vi.mock("node:fs", () => ({
    existsSync: vi.fn(() => false),
}));
vi.mock("../src/run-manager.js", () => ({
    RunManager: {
        persistNotes: vi.fn(),
    },
}));
vi.mock("../src/context-accumulator.js", () => ({
    buildIterationPrompt: vi.fn(() => "generic-prompt"),
    buildSkillAwarePrompt: vi.fn(() => "skill-aware-prompt"),
    appendEntry: vi.fn((content) => content),
    formatNotesDocument: vi.fn(() => ""),
}));
vi.mock("../src/skill-scheduler.js", () => ({
    determineNextSkill: vi.fn(() => ({
        nextPhase: "build",
        reason: "tasks incomplete",
    })),
    shouldCommitForPhase: vi.fn((phase, success) => {
        if (!success)
            return false;
        return ["build", "plan", "fix", "refactor-apply", "fix-apply"].includes(phase);
    }),
}));
vi.mock("../src/status-file-ext.js", () => ({
    extractLoopFields: vi.fn(() => ({})),
    writeLoopFields: vi.fn((content) => content),
    clearLoopFields: vi.fn((content) => content),
    updateIterationStatus: vi.fn((_content, phase, iteration) => {
        return `---\nphase: "${phase}"\nloop_iteration: ${iteration}\n---\n`;
    }),
}));
import { SdkDriver } from "../src/sdk-driver.js";
import { clearLoopFields, extractLoopFields } from "../src/status-file-ext.js";
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
            summary: "completed build task",
            key_changes_made: ["added feature"],
            key_learnings: ["learned something"],
        },
        usage: createMockUsage(),
    };
}
function createStopResult() {
    return {
        output: {
            success: true,
            summary: "all done",
            key_changes_made: ["final change"],
            key_learnings: [],
            should_fully_stop: true,
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
        objective: "Build a feature",
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
        branchName: "forge/build-a-feature",
        skillAware: true,
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
// 1. StatusFile write failure degradation (Requirement 6.7)
// ---------------------------------------------------------------------------
describe("StatusFile write failure degradation (Requirement 6.7)", () => {
    it("logs a warning but does NOT abort when writeStatusFile throws during iteration", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        vi.spyOn(console, "log").mockImplementation(() => { });
        const writeStatusFile = vi.fn().mockImplementation(() => {
            throw new Error("disk full");
        });
        const readStatusFile = vi.fn().mockReturnValue("");
        const executor = createMockEffectExecutor();
        const agent = createMockAgent();
        const config = createConfig({
            skillAware: true,
            limits: { maxIterations: 1 },
            readStatusFile,
            writeStatusFile,
        });
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // The driver should complete without throwing
        expect(result.finalState).toBeDefined();
        expect(result.notesDocument.entries).toHaveLength(1);
        expect(agent.run).toHaveBeenCalledTimes(1);
        // A warning should have been logged about the StatusFile failure
        expect(warnSpy).toHaveBeenCalled();
        const warningMessages = warnSpy.mock.calls.map((call) => call[0]);
        const hasStatusFileWarning = warningMessages.some((msg) => msg.includes("StatusFile") || msg.includes("status"));
        expect(hasStatusFileWarning).toBe(true);
    });
    it("logs a warning but does NOT abort when writeStatusFile throws during cleanup", async () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => { });
        vi.spyOn(console, "warn").mockImplementation(() => { });
        // Make clearLoopFields throw to simulate write failure during cleanup
        vi.mocked(clearLoopFields).mockImplementation(() => {
            throw new Error("permission denied");
        });
        const readStatusFile = vi.fn().mockReturnValue("");
        const writeStatusFile = vi.fn(); // normal write succeeds
        const executor = createMockEffectExecutor();
        const agent = createMockAgent();
        const config = createConfig({
            skillAware: true,
            limits: { maxIterations: 1 },
            readStatusFile,
            writeStatusFile,
        });
        const driver = new SdkDriver(config, executor, agent);
        // Should NOT throw despite cleanup failure
        const result = await driver.run();
        expect(result.finalState).toBeDefined();
        expect(result.notesDocument.entries).toHaveLength(1);
        // Warning should be logged about the cleanup failure
        const allMessages = [
            ...logSpy.mock.calls.map((call) => call[0]),
            ...errSpy.mock.calls.map((call) => call[0]),
        ];
        const hasCleanupWarning = allMessages.some((msg) => msg.includes("status_field_clear_failed") ||
            msg.includes("clear") ||
            msg.includes("StatusFile"));
        expect(hasCleanupWarning).toBe(true);
        errSpy.mockRestore();
    });
    it("continues execution across multiple iterations despite write failures", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => { });
        vi.spyOn(console, "log").mockImplementation(() => { });
        let callCount = 0;
        const writeStatusFile = vi.fn().mockImplementation(() => {
            throw new Error(`write failure #${++callCount}`);
        });
        const readStatusFile = vi.fn().mockReturnValue("");
        const executor = createMockEffectExecutor();
        // Agent returns success on first call, then stops on second
        const agent = createMockAgent(async () => {
            if (agent.run.mock.calls.length <= 1) {
                return createSuccessResult();
            }
            return createStopResult();
        });
        const config = createConfig({
            skillAware: true,
            limits: { maxIterations: 3 },
            readStatusFile,
            writeStatusFile,
        });
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // Driver should have run multiple iterations despite write failures
        expect(agent.run).toHaveBeenCalledTimes(2);
        expect(result.notesDocument.entries).toHaveLength(2);
        expect(result.finalState).toBeDefined();
    });
});
// ---------------------------------------------------------------------------
// 2. StatusFile read failure degradation
// ---------------------------------------------------------------------------
describe("StatusFile read failure degradation", () => {
    it("uses empty string as default when readStatusFile throws", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => { });
        vi.spyOn(console, "log").mockImplementation(() => { });
        const readStatusFile = vi.fn().mockImplementation(() => {
            throw new Error("file not found");
        });
        const writeStatusFile = vi.fn();
        const executor = createMockEffectExecutor();
        const agent = createMockAgent();
        const config = createConfig({
            skillAware: true,
            limits: { maxIterations: 1 },
            readStatusFile,
            writeStatusFile,
        });
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // Driver should complete successfully
        expect(result.finalState).toBeDefined();
        expect(agent.run).toHaveBeenCalledTimes(1);
        expect(result.notesDocument.entries).toHaveLength(1);
        // extractLoopFields should have been called with empty string (the fallback)
        expect(extractLoopFields).toHaveBeenCalledWith("");
    });
    it("continues when readStatusFile is not configured", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => { });
        vi.spyOn(console, "log").mockImplementation(() => { });
        const executor = createMockEffectExecutor();
        const agent = createMockAgent();
        const config = createConfig({
            skillAware: true,
            limits: { maxIterations: 1 },
            // No readStatusFile or writeStatusFile configured
        });
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // Driver should complete successfully with no StatusFile callbacks
        expect(result.finalState).toBeDefined();
        expect(agent.run).toHaveBeenCalledTimes(1);
        expect(result.notesDocument.entries).toHaveLength(1);
    });
});
// ---------------------------------------------------------------------------
// 3. Pure functions handle corrupted/empty StatusFile content gracefully
// ---------------------------------------------------------------------------
describe("Pure functions handle corrupted/empty StatusFile content gracefully", () => {
    // Re-import the real functions (not mocked)
    // We test the actual pure functions from status-file-ext.ts directly
    let realExtractLoopFields;
    let realWriteLoopFields;
    let realClearLoopFields;
    let realUpdateIterationStatus;
    beforeEach(async () => {
        // Restore real implementations for pure function tests
        vi.restoreAllMocks();
        // Dynamically import the real module (bypassing mocks)
        const mod = await vi.importActual("../src/status-file-ext.js");
        realExtractLoopFields = mod.extractLoopFields;
        realWriteLoopFields = mod.writeLoopFields;
        realClearLoopFields = mod.clearLoopFields;
        realUpdateIterationStatus = mod.updateIterationStatus;
    });
    it("extractLoopFields returns empty object for empty string", () => {
        const result = realExtractLoopFields("");
        expect(result).toEqual({});
    });
    it("extractLoopFields returns empty object for content without frontmatter", () => {
        const result = realExtractLoopFields("just some random text\nno frontmatter here");
        expect(result).toEqual({});
    });
    it("extractLoopFields returns empty object for corrupted frontmatter", () => {
        const corrupted = "---\n@#$%^&*()_+\n---\n";
        const result = realExtractLoopFields(corrupted);
        expect(result).toEqual({});
    });
    it("extractLoopFields returns empty object for frontmatter with only opening delimiter", () => {
        const partial = "---\nmode: autonomous\n";
        const result = realExtractLoopFields(partial);
        expect(result).toEqual({});
    });
    it("extractLoopFields ignores invalid mode values", () => {
        const content = '---\nmode: "invalid_mode"\n---\n';
        const result = realExtractLoopFields(content);
        expect(result.mode).toBeUndefined();
    });
    it("extractLoopFields ignores non-numeric loop_iteration", () => {
        const content = "---\nloop_iteration: not_a_number\n---\n";
        const result = realExtractLoopFields(content);
        expect(result.loopIteration).toBeUndefined();
    });
    it("writeLoopFields handles empty string input without throwing", () => {
        const result = realWriteLoopFields("", { mode: "autonomous" });
        expect(result).toContain("autonomous");
        expect(result).toContain("---");
    });
    it("clearLoopFields returns empty string unchanged", () => {
        const result = realClearLoopFields("");
        expect(result).toBe("");
    });
    it("clearLoopFields returns content without frontmatter unchanged", () => {
        const content = "no frontmatter here";
        const result = realClearLoopFields(content);
        expect(result).toBe(content);
    });
    it("updateIterationStatus handles empty string input without throwing", () => {
        const result = realUpdateIterationStatus("", "build", 3);
        expect(result).toContain("build");
        expect(result).toContain("3");
        expect(result).toContain("---");
    });
    it("updateIterationStatus handles content without frontmatter", () => {
        const content = "# Status\nSome notes";
        const result = realUpdateIterationStatus(content, "review", 5);
        expect(result).toContain("review");
        expect(result).toContain("5");
        expect(result).toContain("# Status");
    });
});
//# sourceMappingURL=statusfile-io.test.js.map