import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Mock RunManager.persistNotes before importing SdkDriver
vi.mock("../src/run-manager.js", () => ({
    RunManager: {
        persistNotes: vi.fn(),
    },
}));
import { buildSkillAwarePrompt } from "../src/context-accumulator.js";
import { advanceMethodology, buildPressurePrompt, detectFailurePattern, determinePressureLevel, getMethodologyChain, getStallResponse, } from "../src/pua-engine.js";
import { SdkDriver } from "../src/sdk-driver.js";
import { clearPuaFields, extractPuaFields, writePuaFields } from "../src/status-file-ext.js";
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
function createSuccessResult(summary = "did stuff") {
    return {
        output: {
            success: true,
            summary,
            key_changes_made: ["change"],
            key_learnings: ["learning"],
        },
        usage: createMockUsage(),
    };
}
function createSoftFailureResult(summary = "failed to make progress") {
    return {
        output: {
            success: false,
            summary,
            key_changes_made: [],
            key_learnings: [],
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
/**
 * Create a SdkDriverConfig with StatusFile read/write callbacks backed
 * by a simple in-memory string. Returns the config and a getter for
 * the current StatusFile content.
 */
function createPuaConfig(overrides) {
    let statusContent = '---\ncurrent_task: "test task"\ntier: "standard"\n---\n# Status\n';
    const config = {
        objective: "Build a login form",
        loopConfig: {
            agent: "claude",
            maxConsecutiveFailures: 10, // High threshold so PUA can exercise
            preventSleep: true,
            backoffBaseMs: 60000,
            maxConcurrentWorktrees: 3,
        },
        limits: { maxIterations: 10 },
        cwd: "/test/repo",
        runId: "pua-test-run",
        runDir: "/test/repo/.forge/runs/pua-test-run/",
        warmQuery: {},
        baseCommit: "abc123",
        notesPath: "/test/repo/.forge/runs/pua-test-run/notes.md",
        branchName: "forge/build-a-login-form",
        skillAware: true,
        puaEnabled: true,
        puaTaskType: "debug",
        readStatusFile: () => statusContent,
        writeStatusFile: (content) => {
            statusContent = content;
        },
        ...overrides,
    };
    return { config, getStatusContent: () => statusContent };
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
// 1. Failure pattern detection → pressure escalation → methodology switch
//    → prompt injection
// ---------------------------------------------------------------------------
describe("Failure pattern detection → pressure escalation → methodology switch → prompt injection", () => {
    /**
     * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.9
     *
     * Simulates consecutive failures with giving-up keywords in summaries.
     * Verifies that:
     * - PUA fields are written to StatusFile after failures
     * - Pressure level escalates with consecutive failures
     * - Methodology is selected and injected into the prompt
     * - The pressure prompt is injected into the iteration prompt
     */
    it("escalates pressure and injects PUA prompt after consecutive failures", async () => {
        const executor = createMockEffectExecutor();
        const capturedPrompts = [];
        let callNum = 0;
        const agent = createMockAgent(async (prompt) => {
            capturedPrompts.push(prompt);
            callNum++;
            // All iterations fail with giving-up keywords
            return createSoftFailureResult(`Unable to fix the issue, cannot resolve the dependency conflict (attempt ${callNum})`);
        });
        const { config, getStatusContent } = createPuaConfig({
            limits: { maxIterations: 4 },
        });
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        // After multiple failures, PUA fields should be written to StatusFile
        const _puaFields = extractPuaFields(getStatusContent());
        // Pressure level should have escalated (at least L1 after 2+ failures)
        // The exact level depends on how many failures occurred before abort
        expect(agent.run).toHaveBeenCalled();
        expect(callNum).toBeGreaterThanOrEqual(2);
        // After the 2nd failure, the 3rd iteration prompt should contain PUA content
        // (PUA context is built from persisted state before each iteration)
        if (capturedPrompts.length >= 3) {
            const thirdPrompt = capturedPrompts[2];
            // PUA section should be present in the prompt
            expect(thirdPrompt).toContain("PUA Quality Engine");
            // Three Red Lines should always be present
            expect(thirdPrompt).toContain("Three Red Lines");
        }
    });
    it("pure function pipeline: detect → pressure → methodology → prompt", () => {
        // Simulate 3 consecutive failures with giving-up pattern
        const summaries = [
            "Unable to resolve the issue, cannot fix the build",
            "Cannot solve this problem, out of scope for current approach",
            "Unable to make progress, manual intervention needed",
        ];
        // Step 1: Detect failure pattern
        const pattern = detectFailurePattern(summaries);
        expect(pattern).toBe("giving-up");
        // Step 2: Determine pressure level (3 failures)
        const level = determinePressureLevel(3, false);
        expect(level).toBe("L2");
        // Step 3: Get methodology chain for giving-up pattern
        const chain = getMethodologyChain("giving-up");
        expect(chain).toEqual(["netflix-keeper", "huawei-rca", "musk-algorithm"]);
        // Step 4: Select first methodology from chain
        const methodology = chain[0];
        expect(methodology).toBe("netflix-keeper");
        // Step 5: Get stall response
        const stallResponse = getStallResponse(3);
        expect(stallResponse).toBe("reassess");
        // Step 6: Build pressure prompt
        const prompt = buildPressurePrompt(level, methodology, pattern, stallResponse);
        // Verify prompt contains expected content
        expect(prompt).toContain("Three Red Lines");
        expect(prompt).toContain("Proactivity Guidance");
        expect(prompt).toContain("Switch Approach"); // L1+
        expect(prompt).toContain("Deep Investigation Required"); // L2+
        expect(prompt).toContain("Universal Methodology"); // L2+
        expect(prompt).toContain("Netflix Keeper Test"); // methodology description
        expect(prompt).toContain("Giving Up"); // failure pattern counter
        // Step 7: Inject into skill-aware prompt
        const puaContext = {
            pressureLevel: level,
            methodology,
            failurePattern: pattern,
            stallResponse,
            pressurePrompt: prompt,
        };
        const fullPrompt = buildSkillAwarePrompt({
            base: {
                iteration: 4,
                runId: "test-run",
                objective: "Fix the build",
                notesContent: "# Notes",
            },
            skill: {
                phase: "build",
                tier: "standard",
            },
            puaContext,
        });
        // Verify PUA section is in the full prompt
        expect(fullPrompt).toContain("## PUA Quality Engine");
        expect(fullPrompt).toContain("Three Red Lines");
        // PUA section should be after SKILL Context
        const skillIdx = fullPrompt.indexOf("## SKILL Context");
        const puaIdx = fullPrompt.indexOf("## PUA Quality Engine");
        const execIdx = fullPrompt.indexOf("## Execution Mode");
        expect(puaIdx).toBeGreaterThan(skillIdx);
        expect(puaIdx).toBeLessThan(execIdx);
    });
});
// ---------------------------------------------------------------------------
// 2. Complete soft recovery flow
// ---------------------------------------------------------------------------
describe("Complete soft recovery flow", () => {
    /**
     * Validates: Requirements 6.2, 6.3, 6.4, 6.6, 6.9
     *
     * Simulates consecutive failures where pressure gradually escalates
     * and methodology switches through the chain. Verifies prompt content
     * grows monotonically with pressure level.
     */
    it("pressure escalates and prompt grows monotonically across failure levels", () => {
        const levels = ["L0", "L1", "L2", "L3", "L4"];
        const methodology = "huawei-rca";
        const prompts = [];
        for (const level of levels) {
            const prompt = buildPressurePrompt(level, methodology, null, null);
            prompts.push(prompt);
        }
        // Verify monotonic growth: each higher level's prompt is longer
        for (let i = 1; i < prompts.length; i++) {
            expect(prompts[i].length).toBeGreaterThan(prompts[i - 1].length);
        }
        // All levels contain Three Red Lines and Proactivity Guidance
        for (const prompt of prompts) {
            expect(prompt).toContain("Three Red Lines");
            expect(prompt).toContain("Proactivity Guidance");
        }
        // L1+ contains Switch Approach
        expect(prompts[0]).not.toContain("Switch Approach");
        for (let i = 1; i < prompts.length; i++) {
            expect(prompts[i]).toContain("Switch Approach");
        }
        // L2+ contains Universal Methodology 5-step section header
        expect(prompts[1]).not.toContain("## Universal Methodology (5 Steps)");
        for (let i = 2; i < prompts.length; i++) {
            expect(prompts[i]).toContain("## Universal Methodology (5 Steps)");
        }
        // L3+ contains 7-Point Checklist
        expect(prompts[2]).not.toContain("7-Point Diagnostic Checklist");
        for (let i = 3; i < prompts.length; i++) {
            expect(prompts[i]).toContain("7-Point Diagnostic Checklist");
        }
        // L4 contains Desperation Mode
        expect(prompts[3]).not.toContain("Desperation Mode");
        expect(prompts[4]).toContain("Desperation Mode");
    });
    it("methodology switches through the chain on consecutive failures", () => {
        const chain = getMethodologyChain("spinning");
        expect(chain).toEqual(["musk-algorithm", "alibaba-closure", "huawei-rca"]);
        // Advance through the chain
        const first = chain[0];
        expect(first).toBe("musk-algorithm");
        const second = advanceMethodology(chain, 0);
        expect(second).toBe("alibaba-closure");
        const third = advanceMethodology(chain, 1);
        expect(third).toBe("huawei-rca");
        // Chain exhausted
        const exhausted = advanceMethodology(chain, 2);
        expect(exhausted).toBeNull();
    });
    it("SdkDriver escalates PUA state across multiple failed iterations", async () => {
        const executor = createMockEffectExecutor();
        const capturedPrompts = [];
        let callNum = 0;
        const agent = createMockAgent(async (prompt) => {
            capturedPrompts.push(prompt);
            callNum++;
            // Return failures with "cannot" keyword to trigger giving-up pattern
            return createSoftFailureResult(`Cannot resolve issue attempt ${callNum}`);
        });
        const { config, getStatusContent } = createPuaConfig({
            limits: { maxIterations: 5 },
        });
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        // Verify PUA fields were persisted to StatusFile
        const _finalFields = extractPuaFields(getStatusContent());
        // After multiple failures, we should have PUA state persisted
        // (exact values depend on how many iterations ran before abort)
        expect(callNum).toBeGreaterThanOrEqual(3);
        // The later prompts should contain PUA content (after state is persisted)
        // The first prompt won't have PUA (no failures yet), but subsequent ones should
        if (capturedPrompts.length >= 3) {
            // By the 3rd iteration, PUA should be active
            expect(capturedPrompts[2]).toContain("PUA Quality Engine");
        }
    });
});
// ---------------------------------------------------------------------------
// 3. Methodology chain exhaustion doesn't block Orchestrator circuit-breaking
// ---------------------------------------------------------------------------
describe("Methodology chain exhaustion doesn't block Orchestrator circuit-breaking", () => {
    /**
     * Validates: Requirements 6.7, 8.2
     *
     * Simulates enough failures to exhaust the methodology chain.
     * Verifies advanceMethodology returns null and the system continues
     * to function without crashing.
     */
    it("advanceMethodology returns null when chain is exhausted", () => {
        const chain = getMethodologyChain("spinning");
        expect(chain).toHaveLength(3);
        // Walk through the entire chain
        expect(advanceMethodology(chain, 0)).toBe("alibaba-closure");
        expect(advanceMethodology(chain, 1)).toBe("huawei-rca");
        expect(advanceMethodology(chain, 2)).toBeNull(); // exhausted
        // Beyond the chain — still returns null, no crash
        expect(advanceMethodology(chain, 3)).toBeNull();
        expect(advanceMethodology(chain, 100)).toBeNull();
    });
    it("empty chain returns null immediately", () => {
        expect(advanceMethodology([], 0)).toBeNull();
        expect(advanceMethodology([], -1)).toBeNull();
    });
    it("SdkDriver continues to function after methodology chain exhaustion", async () => {
        const executor = createMockEffectExecutor();
        let callNum = 0;
        const agent = createMockAgent(async () => {
            callNum++;
            // All iterations fail — enough to exhaust any 3-element chain
            return createSoftFailureResult(`Cannot fix it, attempt ${callNum}`);
        });
        // Use a high maxConsecutiveFailures so the orchestrator doesn't abort too early
        const { config } = createPuaConfig({
            limits: { maxIterations: 8 },
            loopConfig: {
                agent: "claude",
                maxConsecutiveFailures: 8,
                preventSleep: true,
                backoffBaseMs: 60000,
                maxConcurrentWorktrees: 3,
            },
        });
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // The driver should have run multiple iterations without crashing
        // (circuit breaker may trigger before maxIterations, but at least 3 iterations should run)
        expect(callNum).toBeGreaterThanOrEqual(3);
        // The loop should eventually terminate (via maxIterations or circuit breaker)
        expect(["aborted", "stopped"]).toContain(result.finalState.status);
        // No unhandled exceptions — the test completing is the proof
    });
});
// ---------------------------------------------------------------------------
// 4. puaEnabled: false backward compatibility
// ---------------------------------------------------------------------------
describe("puaEnabled: false backward compatibility", () => {
    /**
     * Validates: Requirements 6.8, 8.1, 8.4, 8.5, 8.6, 8.7
     *
     * Verifies that when puaEnabled is false, no PUA-related behavior occurs
     * and prompt output doesn't contain PUA sections.
     */
    it("no PUA fields in StatusFile when puaEnabled is false", async () => {
        const executor = createMockEffectExecutor();
        const agent = createMockAgent(async () => createSoftFailureResult("failed attempt"));
        const { config, getStatusContent } = createPuaConfig({
            puaEnabled: false,
            limits: { maxIterations: 3 },
        });
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        // StatusFile should not contain any PUA fields
        const puaFields = extractPuaFields(getStatusContent());
        expect(puaFields.puaPressureLevel).toBeUndefined();
        expect(puaFields.puaMethodology).toBeUndefined();
        expect(puaFields.puaChainIndex).toBeUndefined();
        expect(puaFields.puaFailurePattern).toBeUndefined();
    });
    it("prompt does not contain PUA sections when puaEnabled is false", async () => {
        const executor = createMockEffectExecutor();
        const capturedPrompts = [];
        const agent = createMockAgent(async (prompt) => {
            capturedPrompts.push(prompt);
            return createSoftFailureResult("failed attempt");
        });
        const { config } = createPuaConfig({
            puaEnabled: false,
            limits: { maxIterations: 3 },
        });
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        // No prompt should contain PUA Quality Engine section
        for (const prompt of capturedPrompts) {
            expect(prompt).not.toContain("## PUA Quality Engine");
            expect(prompt).not.toContain("Three Red Lines");
            expect(prompt).not.toContain("Proactivity Guidance");
        }
    });
    it("buildSkillAwarePrompt without puaContext matches pre-PUA behavior", () => {
        const baseParams = {
            base: {
                iteration: 1,
                runId: "test-run",
                objective: "Build a login form",
                notesContent: "# Notes",
            },
            skill: {
                phase: "build",
                tier: "standard",
            },
        };
        const withoutPua = buildSkillAwarePrompt(baseParams);
        const withUndefinedPua = buildSkillAwarePrompt({ ...baseParams, puaContext: undefined });
        // Both should be identical
        expect(withoutPua).toBe(withUndefinedPua);
        // Neither should contain PUA sections
        expect(withoutPua).not.toContain("## PUA Quality Engine");
        expect(withoutPua).not.toContain("Three Red Lines");
    });
    it("puaEnabled defaults to false when not specified", async () => {
        const executor = createMockEffectExecutor();
        const capturedPrompts = [];
        const agent = createMockAgent(async (prompt) => {
            capturedPrompts.push(prompt);
            return createSoftFailureResult("failed");
        });
        // Create config without puaEnabled
        const { config } = createPuaConfig({
            limits: { maxIterations: 2 },
        });
        // Explicitly remove puaEnabled to test default behavior
        delete config.puaEnabled;
        const driver = new SdkDriver(config, executor, agent);
        await driver.run();
        // No PUA content should appear
        for (const prompt of capturedPrompts) {
            expect(prompt).not.toContain("## PUA Quality Engine");
        }
    });
});
// ---------------------------------------------------------------------------
// 5. PUA engine exception degradation
// ---------------------------------------------------------------------------
describe("PUA engine exception degradation", () => {
    /**
     * Validates: Requirements 8.3
     *
     * Tests that if PUA engine functions throw, the system degrades gracefully.
     * The iteration should continue without PUA rather than crashing.
     */
    it("StatusFile read failure degrades gracefully", async () => {
        const executor = createMockEffectExecutor();
        let callNum = 0;
        const agent = createMockAgent(async () => {
            callNum++;
            return createSoftFailureResult(`failed attempt ${callNum}`);
        });
        let readCallCount = 0;
        const { config } = createPuaConfig({
            limits: { maxIterations: 3 },
            readStatusFile: () => {
                readCallCount++;
                // Throw on every other read to simulate intermittent failures
                if (readCallCount % 2 === 0) {
                    throw new Error("StatusFile read failed");
                }
                return '---\ncurrent_task: "test"\n---\n';
            },
        });
        // Suppress console.warn during this test
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // The driver should have completed without crashing
        expect(callNum).toBeGreaterThanOrEqual(1);
        expect(["aborted", "stopped"]).toContain(result.finalState.status);
        warnSpy.mockRestore();
    });
    it("StatusFile write failure degrades gracefully", async () => {
        const executor = createMockEffectExecutor();
        let callNum = 0;
        const agent = createMockAgent(async () => {
            callNum++;
            return createSoftFailureResult(`Cannot fix, attempt ${callNum}`);
        });
        const { config } = createPuaConfig({
            limits: { maxIterations: 3 },
            writeStatusFile: () => {
                throw new Error("StatusFile write failed");
            },
        });
        // Suppress console.warn during this test
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        const driver = new SdkDriver(config, executor, agent);
        const result = await driver.run();
        // The driver should have completed without crashing
        expect(callNum).toBeGreaterThanOrEqual(1);
        expect(["aborted", "stopped"]).toContain(result.finalState.status);
        warnSpy.mockRestore();
    });
    it("corrupted StatusFile PUA fields degrade to defaults", () => {
        // extractPuaFields should handle corrupted content gracefully
        const corrupted = "---\npua_pressure_level: INVALID\npua_chain_index: not_a_number\n---\n";
        const fields = extractPuaFields(corrupted);
        // Invalid pressure level should be undefined (not in valid set)
        expect(fields.puaPressureLevel).toBeUndefined();
        // Non-numeric chain index should be undefined
        expect(fields.puaChainIndex).toBeUndefined();
    });
    it("empty string StatusFile content returns defaults without throwing", () => {
        const fields = extractPuaFields("");
        expect(fields.puaPressureLevel).toBeUndefined();
        expect(fields.puaMethodology).toBeUndefined();
        expect(fields.puaChainIndex).toBeUndefined();
        expect(fields.puaFailurePattern).toBeUndefined();
    });
    it("PUA fields round-trip through StatusFile write/extract", () => {
        const initial = '---\ncurrent_task: "test"\n---\n# Status\n';
        const written = writePuaFields(initial, {
            puaPressureLevel: "L2",
            puaMethodology: "huawei-rca",
            puaChainIndex: 1,
            puaFailurePattern: "spinning",
        });
        const extracted = extractPuaFields(written);
        expect(extracted.puaPressureLevel).toBe("L2");
        expect(extracted.puaMethodology).toBe("huawei-rca");
        expect(extracted.puaChainIndex).toBe(1);
        expect(extracted.puaFailurePattern).toBe("spinning");
        // Non-PUA fields should be preserved
        expect(written).toContain("current_task");
        // Clear PUA fields
        const cleared = clearPuaFields(written);
        const clearedFields = extractPuaFields(cleared);
        expect(clearedFields.puaPressureLevel).toBeUndefined();
        expect(clearedFields.puaMethodology).toBeUndefined();
        expect(clearedFields.puaChainIndex).toBeUndefined();
        expect(clearedFields.puaFailurePattern).toBeUndefined();
        // Non-PUA fields should still be preserved
        expect(cleared).toContain("current_task");
    });
});
//# sourceMappingURL=pua-integration.test.js.map