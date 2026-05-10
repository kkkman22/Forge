/**
 * Property test: SdkDriver hooks enforcement.
 *
 * Verifies that SdkDriver.run() rejects startup when hooks protection is
 * missing and forceNoHooks is not enabled. The agent must never be invoked.
 *
 * **Validates: v2.4 Requirement 1.7**
 */
import * as fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HooksProtectionMissingError } from "../src/forge-error.js";
import { SdkDriver } from "../src/sdk-driver.js";
function buildMinimalConfig(overrides = {}) {
    return {
        objective: "test objective",
        loopConfig: {
            agent: "claude",
            maxConsecutiveFailures: 3,
            preventSleep: false,
            backoffBaseMs: 60000,
            maxConcurrentWorktrees: 3,
        },
        limits: { maxIterations: 5, maxTokens: 10000 },
        cwd: `/tmp/forge-hooks-test-${Math.random().toString(36).slice(2)}`,
        runId: `test-hooks-${Math.random().toString(36).slice(2)}`,
        runDir: "/tmp/forge-hooks-test",
        warmQuery: null,
        baseCommit: "abc123",
        notesPath: "/tmp/forge-hooks-test/notes.md",
        branchName: "test-branch",
        skillAware: false,
        ...overrides,
    };
}
const stubEffectExecutor = {
    aborted: false,
    stopped: false,
    executeEffects: vi.fn().mockResolvedValue(undefined),
    executeEffect: vi.fn().mockResolvedValue(undefined),
};
/** Agent mock that tracks invocation count. */
function createTrackingAgent() {
    const obj = {
        invocationCount: 0,
        name: "test-agent",
        async run() {
            obj.invocationCount++;
            return {
                output: { success: true, summary: "done", key_changes_made: [], key_learnings: [] },
                usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
            };
        },
    };
    return obj;
}
describe("SdkDriver hooks enforcement (property)", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });
    it("rejects start when hooks missing and forceNoHooks is false", async () => {
        const agent = createTrackingAgent();
        const config = buildMinimalConfig({ forceNoHooks: false });
        const driver = new SdkDriver(config, stubEffectExecutor, agent);
        await expect(driver.run()).rejects.toThrow(HooksProtectionMissingError);
        expect(agent.invocationCount).toBe(0);
    });
    it("rejects start when hooks missing and forceNoHooks is undefined", async () => {
        const agent = createTrackingAgent();
        const config = buildMinimalConfig({});
        const driver = new SdkDriver(config, stubEffectExecutor, agent);
        await expect(driver.run()).rejects.toThrow(HooksProtectionMissingError);
        expect(agent.invocationCount).toBe(0);
    });
    it("allows start when hooks missing but forceNoHooks is true", async () => {
        const agent = createTrackingAgent();
        const config = buildMinimalConfig({ forceNoHooks: true });
        const driver = new SdkDriver(config, stubEffectExecutor, agent);
        try {
            await driver.run();
        }
        catch (err) {
            expect(err).not.toBeInstanceOf(HooksProtectionMissingError);
        }
    });
    it("property: any config without hooks and forceNoHooks=false must throw before agent runs", async () => {
        await fc.assert(fc.asyncProperty(fc.record({
            objective: fc.string({ minLength: 1, maxLength: 50 }),
            runId: fc.string({ minLength: 1, maxLength: 20 }),
        }), async ({ objective, runId }) => {
            const agent = createTrackingAgent();
            const config = buildMinimalConfig({
                objective,
                runId,
                forceNoHooks: false,
            });
            const driver = new SdkDriver(config, stubEffectExecutor, agent);
            try {
                await driver.run();
                expect.unreachable("Should have thrown HooksProtectionMissingError");
            }
            catch (err) {
                expect(err).toBeInstanceOf(HooksProtectionMissingError);
            }
            expect(agent.invocationCount).toBe(0);
        }), { numRuns: 10 });
    });
});
//# sourceMappingURL=sdk-driver.hooks-enforcement.property.test.js.map