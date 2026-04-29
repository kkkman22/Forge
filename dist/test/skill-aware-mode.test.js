/**
 * Unit tests and property test for Skill-aware mode detection and
 * backward compatibility of SdkDriver with skillAware: false.
 *
 * Covers:
 *   - detectSkillAwareMode() returns true when `.forge/` exists
 *   - detectSkillAwareMode() returns false when `.forge/` does not exist
 *   - detectSkillAwareMode() returns false on exception
 *   - Backward compatibility: SdkDriver with skillAware: false uses buildIterationPrompt
 *   - **Property 13: Skill 感知模式自動検出**
 *
 * **Validates: Requirements 12.1, 12.2, 12.3, 12.4**
 */
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// ---------------------------------------------------------------------------
// Mock node:fs before importing the module under test
// ---------------------------------------------------------------------------
vi.mock("node:fs", () => ({
    existsSync: vi.fn(),
}));
// Mock RunManager.persistNotes (required by SdkDriver)
vi.mock("../src/run-manager.js", () => ({
    RunManager: {
        persistNotes: vi.fn(),
    },
}));
// Mock context-accumulator to spy on which prompt builder is called
vi.mock("../src/context-accumulator.js", () => ({
    buildIterationPrompt: vi.fn(() => "generic-prompt"),
    buildSkillAwarePrompt: vi.fn(() => "skill-aware-prompt"),
    appendEntry: vi.fn((content) => content),
    formatNotesDocument: vi.fn(() => ""),
}));
// Mock skill-scheduler (required by skill-aware path)
vi.mock("../src/skill-scheduler.js", () => ({
    determineNextSkill: vi.fn(() => ({
        nextPhase: "router",
        reason: "no phase set",
    })),
    shouldCommitForPhase: vi.fn((phase, success) => {
        if (!success)
            return false;
        return ["build", "plan", "fix", "refactor-apply", "fix-apply"].includes(phase);
    }),
}));
// Mock status-file-ext (required by skill-aware path)
vi.mock("../src/status-file-ext.js", () => ({
    extractLoopFields: vi.fn(() => ({})),
    writeLoopFields: vi.fn((content) => content),
    clearLoopFields: vi.fn((content) => content),
    updateIterationStatus: vi.fn((content) => content),
}));
import { existsSync } from "node:fs";
import { buildIterationPrompt, buildSkillAwarePrompt } from "../src/context-accumulator.js";
import { detectSkillAwareMode, SdkDriver } from "../src/sdk-driver.js";
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
// detectSkillAwareMode() unit tests (Requirements 12.2, 12.3)
// ---------------------------------------------------------------------------
describe("detectSkillAwareMode()", () => {
    it("returns true when .forge/ directory exists", () => {
        vi.mocked(existsSync).mockReturnValue(true);
        const result = detectSkillAwareMode("/some/project");
        expect(result).toBe(true);
        expect(existsSync).toHaveBeenCalledWith("/some/project/.forge");
    });
    it("returns false when .forge/ directory does not exist", () => {
        vi.mocked(existsSync).mockReturnValue(false);
        const result = detectSkillAwareMode("/some/project");
        expect(result).toBe(false);
        expect(existsSync).toHaveBeenCalledWith("/some/project/.forge");
    });
    it("returns false when existsSync throws an error", () => {
        vi.mocked(existsSync).mockImplementation(() => {
            throw new Error("permission denied");
        });
        const result = detectSkillAwareMode("/some/project");
        expect(result).toBe(false);
    });
    it("joins cwd with .forge correctly", () => {
        vi.mocked(existsSync).mockReturnValue(true);
        detectSkillAwareMode("/my/repo");
        expect(existsSync).toHaveBeenCalledWith(expect.stringContaining(".forge"));
    });
});
// ---------------------------------------------------------------------------
// Backward compatibility: skillAware: false (Requirements 12.1, 12.4)
// ---------------------------------------------------------------------------
describe("SdkDriver backward compatibility with skillAware: false", () => {
    it("uses buildIterationPrompt (not buildSkillAwarePrompt) when skillAware is false", async () => {
        vi.spyOn(console, "log").mockImplementation(() => { });
        const executor = createMockEffectExecutor();
        const agent = createMockAgent();
        const config = createConfig({ skillAware: false, limits: { maxIterations: 1 } });
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        expect(buildIterationPrompt).toHaveBeenCalled();
        expect(buildSkillAwarePrompt).not.toHaveBeenCalled();
    });
    it("does not call skill-scheduler functions when skillAware is false", async () => {
        vi.spyOn(console, "log").mockImplementation(() => { });
        const { determineNextSkill } = await import("../src/skill-scheduler.js");
        const executor = createMockEffectExecutor();
        const agent = createMockAgent();
        const config = createConfig({ skillAware: false, limits: { maxIterations: 1 } });
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        expect(determineNextSkill).not.toHaveBeenCalled();
    });
    it("maintains existing iteration behavior with skillAware: false", async () => {
        vi.spyOn(console, "log").mockImplementation(() => { });
        const executor = createMockEffectExecutor();
        const agent = createMockAgent();
        const config = createConfig({ skillAware: false, limits: { maxIterations: 1 } });
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // Standard behavior: 1 iteration, 1 success, aborted due to maxIterations
        expect(agent.run).toHaveBeenCalledTimes(1);
        expect(result.finalState.successCount).toBe(1);
        expect(result.finalState.status).toBe("aborted");
        expect(result.notesDocument.entries).toHaveLength(1);
        expect(result.commitCount).toBe(1);
    });
});
// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 13: Skill 感知模式自動検出
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 13: Skill 感知模式自動検出", () => {
    /**
     * **Validates: Requirements 12.2, 12.3**
     *
     * For any project path, when .forge/ exists → true,
     * when .forge/ doesn't exist → false.
     */
    it(".forge/ exists → detectSkillAwareMode returns true", () => {
        fc.assert(fc.property(fc.stringMatching(/^\/[a-z][a-z0-9/]{0,50}$/).filter((s) => s.length > 1), (cwd) => {
            vi.mocked(existsSync).mockReturnValue(true);
            const result = detectSkillAwareMode(cwd);
            expect(result).toBe(true);
        }), { numRuns: 100 });
    });
    it(".forge/ does not exist → detectSkillAwareMode returns false", () => {
        fc.assert(fc.property(fc.stringMatching(/^\/[a-z][a-z0-9/]{0,50}$/).filter((s) => s.length > 1), (cwd) => {
            vi.mocked(existsSync).mockReturnValue(false);
            const result = detectSkillAwareMode(cwd);
            expect(result).toBe(false);
        }), { numRuns: 100 });
    });
    it("detectSkillAwareMode is deterministic for any cwd and filesystem state", () => {
        fc.assert(fc.property(fc.stringMatching(/^\/[a-z][a-z0-9/]{0,50}$/).filter((s) => s.length > 1), fc.boolean(), (cwd, forgeExists) => {
            vi.mocked(existsSync).mockReturnValue(forgeExists);
            const result1 = detectSkillAwareMode(cwd);
            const result2 = detectSkillAwareMode(cwd);
            expect(result1).toBe(result2);
            expect(result1).toBe(forgeExists);
        }), { numRuns: 100 });
    });
    it("exception in existsSync always yields false", () => {
        fc.assert(fc.property(fc.stringMatching(/^\/[a-z][a-z0-9/]{0,50}$/).filter((s) => s.length > 1), fc.string({ minLength: 1, maxLength: 40 }), (cwd, errorMsg) => {
            vi.mocked(existsSync).mockImplementation(() => {
                throw new Error(errorMsg);
            });
            const result = detectSkillAwareMode(cwd);
            expect(result).toBe(false);
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=skill-aware-mode.test.js.map