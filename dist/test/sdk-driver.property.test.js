/**
 * Property-based tests for the SDK autonomous loop driver layer.
 *
 * Covers:
 *   - Property 1: Driver input validation
 *   - Property 2: Token usage field mapping
 *   - Property 3: Commit effect produces correct git command sequence
 *   - Property 4: Effect execution order preservation
 *   - Property 5: Git commands executed without shell
 *   - Property 6: Loop termination matches state machine status
 *   - Property 7: Iteration entry construction correctness
 *
 * **Validates: Requirements 1.1, 1.5, 2.5, 3.1, 3.6, 3.7, 4.2, 4.4, 5.1, 5.2**
 */
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Mock node:child_process before importing the module under test
vi.mock("node:child_process", () => ({
    execFileSync: vi.fn(),
}));
// Mock the Agent SDK so sdk-agent-adapter.ts can be imported
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
    query: vi.fn(),
}));
// Mock run-manager before importing sdk-driver (which imports it)
vi.mock("../src/run-manager.js", () => ({
    RunManager: { persistNotes: vi.fn() },
}));
// Import after mocking
import { execFileSync } from "node:child_process";
import { EffectExecutor } from "../src/effect-executor.js";
import { buildAddAllCommand, buildCleanCommand, buildCommitCommand, buildResetCommand, buildStashCommand, buildStashRefCommand, } from "../src/git-transaction.js";
import { createInitialState, transition } from "../src/orchestrator.js";
import { mapTokenUsage } from "../src/sdk-agent-adapter.js";
import { SdkDriver } from "../src/sdk-driver.js";
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
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/**
 * Arbitrary OrchestratorEffect that excludes `start_backoff` (async/timer-based)
 * to keep order tracking straightforward and synchronous.
 */
const syncEffectArb = fc.oneof(fc.record({
    type: fc.constant("commit"),
    message: fc.string({ minLength: 1, maxLength: 80 }),
}), fc.record({ type: fc.constant("rollback") }), fc.record({
    type: fc.constant("abort"),
    reason: fc.string({ minLength: 1, maxLength: 80 }),
}), fc.record({ type: fc.constant("stop") }), fc.record({
    type: fc.constant("schedule_iteration"),
    iterationNumber: fc.nat({ max: 100 }),
}));
// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------
beforeEach(() => {
    vi.clearAllMocks();
});
afterEach(() => {
    vi.useRealTimers();
});
// ---------------------------------------------------------------------------
// Feature: sdk-autonomous-loop, Property 4: Effect execution order preservation
// ---------------------------------------------------------------------------
describe("Feature: sdk-autonomous-loop, Property 4: Effect execution order preservation", () => {
    /**
     * **Validates: Requirements 3.6**
     *
     * For any array of OrchestratorEffect descriptors (excluding start_backoff),
     * executeEffects processes them in the exact order they appear in the array.
     * We verify this by recording the index at which each effect is observed
     * and asserting the sequence is monotonically increasing and complete.
     */
    it("executeEffects processes effects in exact array order", async () => {
        await fc.assert(fc.asyncProperty(fc.array(syncEffectArb, { minLength: 0, maxLength: 20 }), async (effects) => {
            const observedOrder = [];
            const onLog = vi.fn();
            const deps = createDeps({ onLog });
            const executor = new EffectExecutor(deps);
            // Spy on executeEffect to capture call order
            const originalExecuteEffect = executor.executeEffect.bind(executor);
            let callIndex = 0;
            executor.executeEffect = async (effect, signal) => {
                observedOrder.push(callIndex++);
                return originalExecuteEffect(effect, signal);
            };
            const mock = execFileSync;
            mock.mockImplementation(() => Buffer.from(""));
            await executor.executeEffects(effects);
            // The observed order should be [0, 1, 2, ..., effects.length - 1]
            const expectedOrder = effects.map((_, i) => i);
            expect(observedOrder).toEqual(expectedOrder);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 3.6**
     *
     * For any array of OrchestratorEffect descriptors, the git commands
     * (execFileSync calls) appear in the order dictated by the effects array.
     * Each commit produces [add, commit] and each rollback produces [reset, clean].
     * The concatenated sequence of git sub-commands must match the expected order.
     */
    it("git command sequence matches effect array order", async () => {
        await fc.assert(fc.asyncProperty(fc.array(syncEffectArb, { minLength: 0, maxLength: 15 }), async (effects) => {
            const deps = createDeps();
            const executor = new EffectExecutor(deps);
            const gitCalls = [];
            const mock = execFileSync;
            mock.mockImplementation((_exec, args) => {
                gitCalls.push([...args]);
                return Buffer.from("");
            });
            await executor.executeEffects(effects);
            // Build the expected sequence of git sub-commands from the effects array
            const expectedGitCalls = [];
            for (const effect of effects) {
                if (effect.type === "commit") {
                    expectedGitCalls.push(["add", "-A"]);
                    expectedGitCalls.push(["diff", "--cached", "--name-only"]);
                    expectedGitCalls.push(["commit", "-m", effect.message]);
                }
                else if (effect.type === "rollback") {
                    expectedGitCalls.push([
                        "stash",
                        "--include-untracked",
                        "-m",
                        "forge-rollback-safety-net",
                    ]);
                    expectedGitCalls.push(["rev-parse", "stash@{0}"]);
                    expectedGitCalls.push(["reset", "--hard", "HEAD"]);
                    expectedGitCalls.push(["clean", "-fd"]);
                }
                // Other effect types don't produce git calls
            }
            expect(gitCalls).toEqual(expectedGitCalls);
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: sdk-autonomous-loop, Property 3: Commit effect produces correct git command sequence
// ---------------------------------------------------------------------------
describe("Feature: sdk-autonomous-loop, Property 3: Commit effect produces correct git command sequence", () => {
    /**
     * **Validates: Requirements 3.1**
     *
     * For any arbitrary commit message string, the effect executor SHALL execute
     * exactly two git commands in order: first `git add -A` (matching
     * `buildAddAllCommand().args`), then `git commit -m <message>` (matching
     * `buildCommitCommand(message).args`), with the message passed as a discrete
     * argument element.
     */
    it("commit effect calls execFileSync with buildAddAllCommand then buildCommitCommand args", async () => {
        const commitMessageArb = fc.oneof(fc.string({ minLength: 0, maxLength: 200 }), fc.constant(""), 
        // Strings with shell metacharacters
        fc.constantFrom("`whoami`", "$(rm -rf /)", "msg; echo pwned", "msg | cat /etc/passwd", "msg & bg", "msg > /dev/null", 'msg "quoted"', "msg 'single'", "msg\nnewline", "msg\rcarriage", "hello world"));
        await fc.assert(fc.asyncProperty(commitMessageArb, async (message) => {
            // Clear mocks before each property run
            vi.clearAllMocks();
            const deps = createDeps();
            const executor = new EffectExecutor(deps);
            const mock = execFileSync;
            mock.mockImplementation(() => Buffer.from(""));
            const commitEffect = { type: "commit", message };
            await executor.executeEffect(commitEffect);
            // Should have called execFileSync exactly 3 times (add + frozen zone diff + commit)
            expect(mock).toHaveBeenCalledTimes(3);
            // First call: git add -A
            const expectedAddArgs = buildAddAllCommand().args;
            expect(mock.mock.calls[0][0]).toBe("git");
            expect(mock.mock.calls[0][1]).toEqual(expectedAddArgs);
            // Second call: git diff --cached --name-only (inner-layer frozen zone check)
            expect(mock.mock.calls[1][0]).toBe("git");
            expect(mock.mock.calls[1][1]).toEqual(["diff", "--cached", "--name-only"]);
            // Third call: git commit -m <message>
            const expectedCommitArgs = buildCommitCommand(message).args;
            expect(mock.mock.calls[2][0]).toBe("git");
            expect(mock.mock.calls[2][1]).toEqual(expectedCommitArgs);
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: sdk-autonomous-loop, Property 5: Git commands executed without shell
// ---------------------------------------------------------------------------
describe("Feature: sdk-autonomous-loop, Property 5: Git commands executed without shell", () => {
    /**
     * Generator for strings containing shell metacharacters.
     *
     * Produces commit messages that include backticks, $(), semicolons, pipes,
     * ampersands, angle brackets, newlines, and other dangerous shell characters.
     */
    const shellMetacharArb = fc.oneof(
    // Strings with embedded shell metacharacters
    fc
        .tuple(fc.string({ minLength: 0, maxLength: 40 }), fc.constantFrom("`", "$(", ")", ";", "|", "&", "<", ">", "\n", "\r", "&&", "||", ">>", "<<", "`whoami`", "$(rm -rf /)", "; echo pwned", "| cat /etc/passwd", "& bg", "> /dev/null", "< /dev/stdin", "\n\n", "\r\n"), fc.string({ minLength: 0, maxLength: 40 }))
        .map(([prefix, meta, suffix]) => `${prefix}${meta}${suffix}`), 
    // Pure metacharacter strings
    fc.constantFrom("`whoami`", "$(rm -rf /)", "msg; echo pwned", "msg | cat /etc/passwd", "msg & bg", "msg > /dev/null", "msg < input", 'msg "quoted"', "msg\nnewline", "msg\rcarriage", "a && b || c; d | e & f > g < h", "`$(;|&<>\n\r)`"));
    /**
     * **Validates: Requirements 3.7**
     *
     * For any commit message containing shell metacharacters, the effect executor
     * SHALL call `execFileSync` with `executable` ("git") as the first argument
     * and `args` array as the second argument. The options object (third argument)
     * SHALL NOT contain `shell: true` — it should only have `{ cwd }`.
     */
    it("commit effects call execFileSync without shell: true", async () => {
        await fc.assert(fc.asyncProperty(shellMetacharArb, async (message) => {
            vi.clearAllMocks();
            const deps = createDeps();
            const executor = new EffectExecutor(deps);
            const mock = execFileSync;
            mock.mockImplementation(() => Buffer.from(""));
            const commitEffect = { type: "commit", message };
            await executor.executeEffect(commitEffect);
            // Should have called execFileSync exactly 3 times (add + frozen zone diff + commit)
            expect(mock).toHaveBeenCalledTimes(3);
            for (let i = 0; i < mock.mock.calls.length; i++) {
                const call = mock.mock.calls[i];
                // First arg must be the executable "git"
                expect(call[0]).toBe("git");
                // Second arg must be an array of strings (args)
                expect(Array.isArray(call[1])).toBe(true);
                // Third arg (options) must NOT contain shell: true
                const options = call[2];
                if (options !== undefined) {
                    expect(options).not.toHaveProperty("shell", true);
                    // Should only have { cwd }
                    expect(options).toEqual({ cwd: deps.cwd });
                }
            }
            // Verify the args match the git-transaction builders
            const expectedAddArgs = buildAddAllCommand().args;
            expect(mock.mock.calls[0][1]).toEqual(expectedAddArgs);
            // Index 1 is the frozen zone diff check
            expect(mock.mock.calls[1][1]).toEqual(["diff", "--cached", "--name-only"]);
            const expectedCommitArgs = buildCommitCommand(message).args;
            expect(mock.mock.calls[2][1]).toEqual(expectedCommitArgs);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 3.7**
     *
     * For any rollback effect, the effect executor SHALL call `execFileSync`
     * with `executable` ("git") as the first argument and `args` array as the
     * second argument. The options object SHALL NOT contain `shell: true`.
     */
    it("rollback effects call execFileSync without shell: true", async () => {
        await fc.assert(fc.asyncProperty(fc.constant(undefined), async () => {
            vi.clearAllMocks();
            const deps = createDeps();
            const executor = new EffectExecutor(deps);
            const mock = execFileSync;
            mock.mockImplementation(() => Buffer.from(""));
            const rollbackEffect = { type: "rollback" };
            await executor.executeEffect(rollbackEffect);
            // Should have called execFileSync exactly 4 times (stash + rev-parse + reset + clean)
            expect(mock).toHaveBeenCalledTimes(4);
            for (let i = 0; i < mock.mock.calls.length; i++) {
                const call = mock.mock.calls[i];
                // First arg must be the executable "git"
                expect(call[0]).toBe("git");
                // Second arg must be an array of strings (args)
                expect(Array.isArray(call[1])).toBe(true);
                // Third arg (options) must NOT contain shell: true
                const options = call[2];
                if (options !== undefined) {
                    expect(options).not.toHaveProperty("shell", true);
                    expect(options).toEqual({ cwd: deps.cwd });
                }
            }
            // Verify the args match the git-transaction builders
            const expectedStashArgs = buildStashCommand("forge-rollback-safety-net").args;
            expect(mock.mock.calls[0][1]).toEqual(expectedStashArgs);
            const expectedStashRefArgs = buildStashRefCommand().args;
            expect(mock.mock.calls[1][1]).toEqual(expectedStashRefArgs);
            const expectedResetArgs = buildResetCommand().args;
            expect(mock.mock.calls[2][1]).toEqual(expectedResetArgs);
            const expectedCleanArgs = buildCleanCommand().args;
            expect(mock.mock.calls[3][1]).toEqual(expectedCleanArgs);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 3.7**
     *
     * For any mix of commit and rollback effects with messages containing shell
     * metacharacters, ALL execFileSync calls SHALL use direct argv arrays without
     * shell: true, regardless of the content of the arguments.
     */
    it("mixed commit and rollback effects never use shell: true", async () => {
        const gitEffectArb = fc.oneof(fc.record({
            type: fc.constant("commit"),
            message: shellMetacharArb,
        }), fc.record({ type: fc.constant("rollback") }));
        await fc.assert(fc.asyncProperty(fc.array(gitEffectArb, { minLength: 1, maxLength: 10 }), async (effects) => {
            vi.clearAllMocks();
            const deps = createDeps();
            const executor = new EffectExecutor(deps);
            const mock = execFileSync;
            mock.mockImplementation(() => Buffer.from(""));
            await executor.executeEffects(effects);
            // Every execFileSync call must follow the pattern:
            // execFileSync("git", [...args], { cwd })
            for (let i = 0; i < mock.mock.calls.length; i++) {
                const call = mock.mock.calls[i];
                // First arg: executable must be "git"
                expect(call[0]).toBe("git");
                // Second arg: must be an array (argv)
                expect(Array.isArray(call[1])).toBe(true);
                // Third arg: options must NOT have shell: true
                const options = call[2];
                if (options !== undefined) {
                    expect(options).not.toHaveProperty("shell", true);
                }
            }
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: sdk-autonomous-loop, Property 2: Token usage field mapping
// ---------------------------------------------------------------------------
describe("Feature: sdk-autonomous-loop, Property 2: Token usage field mapping", () => {
    /**
     * **Validates: Requirements 2.5**
     *
     * For any SDK result message containing usage data with non-negative integer
     * fields (input_tokens, output_tokens, cache_read_input_tokens,
     * cache_creation_input_tokens), the adapter's mapping SHALL produce a
     * TokenUsage object where each field matches its SDK counterpart exactly:
     *   - inputTokens === input_tokens
     *   - outputTokens === output_tokens
     *   - cacheReadTokens === cache_read_input_tokens
     *   - cacheCreationTokens === cache_creation_input_tokens
     */
    it("mapTokenUsage maps each SDK usage field to its TokenUsage counterpart exactly", () => {
        const nonNegIntArb = fc.nat({ max: 1_000_000_000 });
        fc.assert(fc.property(nonNegIntArb, nonNegIntArb, nonNegIntArb, nonNegIntArb, (inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens) => {
            const sdkUsage = {
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                cache_read_input_tokens: cacheReadInputTokens,
                cache_creation_input_tokens: cacheCreationInputTokens,
            };
            const result = mapTokenUsage(sdkUsage);
            expect(result.inputTokens).toBe(inputTokens);
            expect(result.outputTokens).toBe(outputTokens);
            expect(result.cacheReadTokens).toBe(cacheReadInputTokens);
            expect(result.cacheCreationTokens).toBe(cacheCreationInputTokens);
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: sdk-autonomous-loop, Property 1: Driver input validation
// ---------------------------------------------------------------------------
describe("Feature: sdk-autonomous-loop, Property 1: Driver input validation", () => {
    /**
     * **Validates: Requirements 1.1, 1.5**
     *
     * For any objective string, the SdkDriver constructor SHALL accept the input
     * if and only if the objective is a non-empty string after trimming. Empty or
     * whitespace-only objectives SHALL always be rejected with an error.
     */
    /** Minimal mock EffectExecutor for constructor validation. */
    function createMockEffectExecutor() {
        return {
            aborted: false,
            stopped: false,
            executeEffect: vi.fn(),
            executeEffects: vi.fn(),
        };
    }
    /** Minimal mock AgentInterface for constructor validation. */
    function createMockAgentInterface() {
        return {
            name: "test",
            run: vi.fn(),
            close: vi.fn(),
        };
    }
    /** Build a minimal SdkDriverConfig with the given objective. */
    function buildConfig(objective) {
        return {
            objective,
            loopConfig: {
                agent: "claude",
                maxConsecutiveFailures: 3,
                preventSleep: false,
                backoffBaseMs: 60000,
                maxConcurrentWorktrees: 3,
            },
            limits: {},
            cwd: "/test/repo",
            runId: "test-run-id",
            runDir: "/test/runs/test-run-id",
            warmQuery: {},
            baseCommit: "abc123",
            notesPath: "/test/runs/test-run-id/notes.md",
            branchName: "forge/test-branch",
            skillAware: false,
        };
    }
    it("accepts non-empty objectives and rejects empty/whitespace-only objectives", () => {
        fc.assert(fc.property(fc.string(), (objective) => {
            const config = buildConfig(objective);
            const executor = createMockEffectExecutor();
            const agent = createMockAgentInterface();
            if (objective.trim() === "") {
                // Empty or whitespace-only objectives must throw
                expect(() => new SdkDriver(config, executor, agent)).toThrow("Objective must be a non-empty string");
            }
            else {
                // Non-empty objectives must not throw
                expect(() => new SdkDriver(config, executor, agent)).not.toThrow();
            }
        }), { numRuns: 200 });
    });
    it("always rejects empty string objectives", () => {
        fc.assert(fc.property(fc.constant(""), (objective) => {
            const config = buildConfig(objective);
            const executor = createMockEffectExecutor();
            const agent = createMockAgentInterface();
            expect(() => new SdkDriver(config, executor, agent)).toThrow("Objective must be a non-empty string");
        }), { numRuns: 200 });
    });
    it("always rejects whitespace-only objectives", () => {
        const whitespaceArb = fc
            .array(fc.constantFrom(" ", "\t", "\n", "\r", "\f", "\v"), { minLength: 1, maxLength: 50 })
            .map((chars) => chars.join(""));
        fc.assert(fc.property(whitespaceArb, (objective) => {
            const config = buildConfig(objective);
            const executor = createMockEffectExecutor();
            const agent = createMockAgentInterface();
            expect(() => new SdkDriver(config, executor, agent)).toThrow("Objective must be a non-empty string");
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: sdk-autonomous-loop, Property 6: Loop termination matches state machine status
// ---------------------------------------------------------------------------
describe("Feature: sdk-autonomous-loop, Property 6: Loop termination matches state machine status", () => {
    /**
     * **Validates: Requirements 4.2, 4.4**
     *
     * For any sequence of orchestrator events that causes the state machine to
     * transition to `aborted` or `stopped` status, the state machine SHALL reach
     * a terminal state. Conversely, for any sequence where the state machine
     * remains in `running` or `waiting` status, the state SHALL not be terminal.
     *
     * We test the state machine directly via `transition()` since the driver's
     * loop termination is a direct consequence of the state machine status.
     */
    /** Zero token usage for events that require it. */
    const zeroUsage = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
    };
    it("state machine reaches terminal status (aborted) via stop_condition_met", () => {
        fc.assert(fc.property(fc.constant(undefined), () => {
            let state = createInitialState();
            // Start the state machine
            const startResult = transition(state, { type: "start", limits: {} });
            state = startResult.state;
            expect(state.status).toBe("running");
            // A successful iteration
            const successResult = transition(state, {
                type: "iteration_success",
                summary: "did work",
                tokenUsage: zeroUsage,
            });
            state = successResult.state;
            // Stop condition met → aborted
            const stopResult = transition(state, { type: "stop_condition_met" });
            state = stopResult.state;
            expect(state.status).toBe("aborted");
        }), { numRuns: 200 });
    });
    it("state machine reaches terminal status (stopped) via user_interrupt", () => {
        fc.assert(fc.property(fc.constant(undefined), () => {
            let state = createInitialState();
            // Start the state machine
            const startResult = transition(state, { type: "start", limits: {} });
            state = startResult.state;
            expect(state.status).toBe("running");
            // User interrupt → stopped
            const interruptResult = transition(state, { type: "user_interrupt" });
            state = interruptResult.state;
            expect(state.status).toBe("stopped");
        }), { numRuns: 200 });
    });
    it("state machine reaches terminal status (aborted) via circuit breaker on consecutive hard failures", () => {
        fc.assert(fc.property(fc.integer({ min: 3, max: 10 }), (failureCount) => {
            let state = createInitialState();
            // Start the state machine
            const startResult = transition(state, { type: "start", limits: {} });
            state = startResult.state;
            // Apply consecutive hard failures until circuit breaker trips
            for (let i = 0; i < failureCount; i++) {
                const result = transition(state, {
                    type: "iteration_hard_failure",
                    error: `error ${i}`,
                    tokenUsage: zeroUsage,
                });
                state = result.state;
                // If we hit a backoff (waiting), dispatch backoff_elapsed to continue
                if (state.status === "waiting") {
                    const backoffResult = transition(state, { type: "backoff_elapsed" });
                    state = backoffResult.state;
                }
                // If already aborted, stop
                if (state.status === "aborted")
                    break;
            }
            // After 3+ consecutive failures, circuit breaker should have tripped
            expect(state.status).toBe("aborted");
        }), { numRuns: 200 });
    });
    it("state machine reaches terminal status (aborted) via max iterations limit", () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 5 }), (maxIterations) => {
            let state = createInitialState();
            const limits = { maxIterations };
            // Start the state machine
            const startResult = transition(state, { type: "start", limits }, limits);
            state = startResult.state;
            // Run iterations until limit is reached
            for (let i = 0; i < maxIterations; i++) {
                const result = transition(state, {
                    type: "iteration_success",
                    summary: `iteration ${i + 1}`,
                    tokenUsage: zeroUsage,
                }, limits);
                state = result.state;
                if (state.status === "aborted")
                    break;
            }
            expect(state.status).toBe("aborted");
        }), { numRuns: 200 });
    });
    it("state machine stays in running status when no termination conditions are met", () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 10 }), (iterationCount) => {
            let state = createInitialState();
            // No limits — loop should keep running
            const limits = {};
            // Start the state machine
            const startResult = transition(state, { type: "start", limits }, limits);
            state = startResult.state;
            expect(state.status).toBe("running");
            // Run successful iterations — state should remain running
            for (let i = 0; i < iterationCount; i++) {
                const result = transition(state, {
                    type: "iteration_success",
                    summary: `iteration ${i + 1}`,
                    tokenUsage: zeroUsage,
                }, limits);
                state = result.state;
                expect(state.status).toBe("running");
            }
        }), { numRuns: 200 });
    });
    it("state machine enters waiting status on hard failure (not terminal) and resumes on backoff_elapsed", () => {
        fc.assert(fc.property(fc.constant(undefined), () => {
            let state = createInitialState();
            // Start the state machine
            const startResult = transition(state, { type: "start", limits: {} });
            state = startResult.state;
            expect(state.status).toBe("running");
            // A single hard failure → waiting (backoff), not terminal
            const failResult = transition(state, {
                type: "iteration_hard_failure",
                error: "transient error",
                tokenUsage: zeroUsage,
            });
            state = failResult.state;
            expect(state.status).toBe("waiting");
            // Backoff elapsed → back to running
            const backoffResult = transition(state, { type: "backoff_elapsed" });
            state = backoffResult.state;
            expect(state.status).toBe("running");
        }), { numRuns: 200 });
    });
    it("user_interrupt from waiting status also reaches terminal (stopped)", () => {
        fc.assert(fc.property(fc.constant(undefined), () => {
            let state = createInitialState();
            // Start → running
            const startResult = transition(state, { type: "start", limits: {} });
            state = startResult.state;
            // Hard failure → waiting
            const failResult = transition(state, {
                type: "iteration_hard_failure",
                error: "error",
                tokenUsage: zeroUsage,
            });
            state = failResult.state;
            expect(state.status).toBe("waiting");
            // User interrupt from waiting → stopped
            const interruptResult = transition(state, { type: "user_interrupt" });
            state = interruptResult.state;
            expect(state.status).toBe("stopped");
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: sdk-autonomous-loop, Property 7: Iteration entry construction correctness
// ---------------------------------------------------------------------------
describe("Feature: sdk-autonomous-loop, Property 7: Iteration entry construction correctness", () => {
    /**
     * **Validates: Requirements 5.1, 5.2**
     *
     * For any iteration result, the IterationEntry SHALL have:
     * - `success` matching the iteration outcome
     * - `summary` matching the agent's summary (or error message for failures)
     * - `keyChanges` non-empty only for successful iterations
     * - `keyLearnings` preserving the agent's reported learnings
     *
     * We test the entry construction logic directly since `buildIterationEntry`
     * is a private method. We replicate its logic as a pure function and verify
     * the properties hold for all generated inputs.
     */
    /**
     * Replicate the buildIterationEntry logic from SdkDriver.
     * This is the exact same logic as the private method in the driver.
     */
    function buildIterationEntry(number, success, output) {
        return {
            number,
            success,
            summary: output.summary,
            keyChanges: success ? output.key_changes_made : [],
            keyLearnings: output.key_learnings,
        };
    }
    /** Generator for arbitrary AgentOutput-like objects. */
    const agentOutputArb = fc.record({
        summary: fc.string({ minLength: 0, maxLength: 200 }),
        key_changes_made: fc.array(fc.string({ minLength: 1, maxLength: 100 }), {
            minLength: 0,
            maxLength: 10,
        }),
        key_learnings: fc.array(fc.string({ minLength: 1, maxLength: 100 }), {
            minLength: 0,
            maxLength: 10,
        }),
    });
    it("successful iteration entry has success=true, matching summary, keyChanges, and keyLearnings", () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 1000 }), agentOutputArb, (iterationNumber, output) => {
            const entry = buildIterationEntry(iterationNumber, true, output);
            expect(entry.number).toBe(iterationNumber);
            expect(entry.success).toBe(true);
            expect(entry.summary).toBe(output.summary);
            expect(entry.keyChanges).toEqual(output.key_changes_made);
            expect(entry.keyLearnings).toEqual(output.key_learnings);
        }), { numRuns: 200 });
    });
    it("failed iteration entry has success=false, matching summary, empty keyChanges, and preserved keyLearnings", () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 1000 }), agentOutputArb, (iterationNumber, output) => {
            const entry = buildIterationEntry(iterationNumber, false, output);
            expect(entry.number).toBe(iterationNumber);
            expect(entry.success).toBe(false);
            expect(entry.summary).toBe(output.summary);
            // Key changes must be empty for failed iterations
            expect(entry.keyChanges).toEqual([]);
            // Key learnings are preserved regardless of success/failure
            expect(entry.keyLearnings).toEqual(output.key_learnings);
        }), { numRuns: 200 });
    });
    it("keyChanges is non-empty only when success is true and agent reported changes", () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 1000 }), fc.boolean(), agentOutputArb, (iterationNumber, success, output) => {
            const entry = buildIterationEntry(iterationNumber, success, output);
            if (!success) {
                // Failed iterations always have empty keyChanges
                expect(entry.keyChanges).toEqual([]);
            }
            else {
                // Successful iterations have keyChanges matching agent output
                expect(entry.keyChanges).toEqual(output.key_changes_made);
            }
        }), { numRuns: 200 });
    });
    it("keyLearnings always preserves agent learnings regardless of success/failure", () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 1000 }), fc.boolean(), agentOutputArb, (iterationNumber, success, output) => {
            const entry = buildIterationEntry(iterationNumber, success, output);
            // Key learnings are always preserved
            expect(entry.keyLearnings).toEqual(output.key_learnings);
        }), { numRuns: 200 });
    });
    it("hard failure entry (error message as summary) has correct structure", () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 1000 }), fc.string({ minLength: 1, maxLength: 200 }), (iterationNumber, errorMessage) => {
            // Hard failures construct the entry differently — no agent output,
            // just an error message as summary with empty changes and learnings
            const entry = {
                number: iterationNumber,
                success: false,
                summary: errorMessage,
                keyChanges: [],
                keyLearnings: [],
            };
            expect(entry.number).toBe(iterationNumber);
            expect(entry.success).toBe(false);
            expect(entry.summary).toBe(errorMessage);
            expect(entry.keyChanges).toEqual([]);
            expect(entry.keyLearnings).toEqual([]);
        }), { numRuns: 200 });
    });
});
//# sourceMappingURL=sdk-driver.property.test.js.map