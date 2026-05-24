/**
 * Integration unit tests — verify cross-module data flow across the
 * autonomous loop pure-function modules.
 *
 * These are example-based tests (not property-based) that test complete
 * workflows spanning multiple modules imported from the unified entry point.
 *
 * **Validates: Requirements 1.1–9.6**
 */
import { describe, expect, it } from "vitest";
import { buildAgentOutputSchema, buildCommitCommand, calculateBackoffMs, createInitialState, formatCommitMessage, formatIterationEntry, formatNotesDocument, parseNotesDocument, shouldAbort, shouldCircuitBreak, transition, validateAgentOutput, } from "../src/loop-index.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const zeroTokens = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
};
const smallTokenUsage = {
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 10,
    cacheCreationTokens: 5,
};
// ---------------------------------------------------------------------------
// 1. Complete iteration lifecycle
// ---------------------------------------------------------------------------
describe("Complete iteration lifecycle: start → success → commit → next", () => {
    it("creates initial idle state, starts, succeeds, and schedules next iteration", () => {
        // Step 1: Create initial state
        const initial = createInitialState();
        expect(initial.status).toBe("idle");
        expect(initial.currentIteration).toBe(0);
        // Step 2: Send start event → should schedule first iteration
        const afterStart = transition(initial, { type: "start", limits: {} });
        expect(afterStart.state.status).toBe("running");
        expect(afterStart.effects).toEqual([{ type: "schedule_iteration", iterationNumber: 1 }]);
        // Step 3: Send iteration_success → should commit + schedule next
        const afterSuccess = transition(afterStart.state, {
            type: "iteration_success",
            summary: "Added login form",
            tokenUsage: smallTokenUsage,
        });
        expect(afterSuccess.state.currentIteration).toBe(1);
        expect(afterSuccess.state.successCount).toBe(1);
        expect(afterSuccess.state.commitCount).toBe(1);
        expect(afterSuccess.state.consecutiveFailures).toBe(0);
        expect(afterSuccess.state.consecutiveErrors).toBe(0);
        // Verify commit effect has properly formatted message
        const commitEffect = afterSuccess.effects.find((e) => e.type === "commit");
        expect(commitEffect).toBeDefined();
        expect(commitEffect?.type).toBe("commit");
        // Verify the commit message matches formatCommitMessage output
        const expectedMessage = formatCommitMessage(1, "Added login form");
        expect(commitEffect.message).toBe(expectedMessage);
        expect(expectedMessage).toContain("1");
        expect(expectedMessage).toContain("Added login form");
        // Verify schedule_iteration for next iteration
        const scheduleEffect = afterSuccess.effects.find((e) => e.type === "schedule_iteration");
        expect(scheduleEffect).toBeDefined();
        expect(scheduleEffect.iterationNumber).toBe(2);
    });
    it("verifies notes can be formatted and parsed round-trip", () => {
        const entry = {
            number: 1,
            success: true,
            summary: "Added login form",
            keyChanges: ["Created LoginForm component", "Added validation logic"],
            keyLearnings: ["React Hook Form simplifies validation"],
        };
        const doc = {
            runId: "test-run-001",
            entries: [entry],
        };
        // Format → parse round-trip
        const markdown = formatNotesDocument(doc);
        const parsed = parseNotesDocument(markdown);
        expect(parsed.runId).toBe(doc.runId);
        expect(parsed.entries).toHaveLength(1);
        expect(parsed.entries[0].number).toBe(1);
        expect(parsed.entries[0].success).toBe(true);
        expect(parsed.entries[0].summary).toBe("Added login form");
        expect(parsed.entries[0].keyChanges).toEqual([
            "Created LoginForm component",
            "Added validation logic",
        ]);
        expect(parsed.entries[0].keyLearnings).toEqual(["React Hook Form simplifies validation"]);
    });
});
// ---------------------------------------------------------------------------
// 2. Failure recovery flow
// ---------------------------------------------------------------------------
describe("Failure recovery flow: hard_failure → backoff → backoff_elapsed → retry", () => {
    it("handles hard failure with rollback + backoff, then recovers on backoff_elapsed", () => {
        // Start from a running state
        const initial = createInitialState();
        const { state: running } = transition(initial, { type: "start", limits: {} });
        // Send hard failure event
        const afterFailure = transition(running, {
            type: "iteration_hard_failure",
            error: "Agent process crashed",
            tokenUsage: smallTokenUsage,
        });
        // Verify rollback + start_backoff effects
        expect(afterFailure.state.status).toBe("waiting");
        expect(afterFailure.state.failCount).toBe(1);
        expect(afterFailure.state.consecutiveFailures).toBe(1);
        expect(afterFailure.state.consecutiveErrors).toBe(1);
        const rollbackEffect = afterFailure.effects.find((e) => e.type === "rollback");
        expect(rollbackEffect).toBeDefined();
        const backoffEffect = afterFailure.effects.find((e) => e.type === "start_backoff");
        expect(backoffEffect).toBeDefined();
        // Verify backoff duration matches calculateBackoffMs formula
        const expectedBackoffMs = calculateBackoffMs(1); // consecutiveErrors = 1
        expect(backoffEffect.durationMs).toBe(expectedBackoffMs);
        expect(expectedBackoffMs).toBe(60_000); // baseMs × 2^(1-1) = 60000
        // Send backoff_elapsed → should resume with schedule_iteration
        const afterElapsed = transition(afterFailure.state, { type: "backoff_elapsed" });
        expect(afterElapsed.state.status).toBe("running");
        expect(afterElapsed.state.waitingUntilMs).toBeNull();
        expect(afterElapsed.effects).toEqual([
            { type: "schedule_iteration", iterationNumber: afterElapsed.state.currentIteration + 1 },
        ]);
    });
});
// ---------------------------------------------------------------------------
// 3. Circuit breaker trigger
// ---------------------------------------------------------------------------
describe("Circuit breaker trigger: consecutive failures reach threshold → abort", () => {
    it("aborts when consecutive failures reach the default threshold of 3", () => {
        // Build a running state with consecutiveFailures at threshold - 1
        const stateAtThreshold = {
            ...createInitialState(),
            status: "running",
            consecutiveFailures: 2,
            consecutiveErrors: 0,
            currentIteration: 2,
            failCount: 2,
        };
        // One more soft failure should trigger circuit breaker
        const afterFailure = transition(stateAtThreshold, {
            type: "iteration_soft_failure",
            summary: "Could not complete task",
            tokenUsage: zeroTokens,
        });
        // consecutiveFailures is now 3 → circuit breaker triggers
        expect(afterFailure.state.status).toBe("aborted");
        expect(afterFailure.state.consecutiveFailures).toBe(3);
        // Should have rollback + abort effects
        const rollbackEffect = afterFailure.effects.find((e) => e.type === "rollback");
        expect(rollbackEffect).toBeDefined();
        const abortEffect = afterFailure.effects.find((e) => e.type === "abort");
        expect(abortEffect).toBeDefined();
        expect(abortEffect.reason).toContain("3");
        expect(abortEffect.reason).toContain("consecutive failures");
        // Verify shouldCircuitBreak agrees
        expect(shouldCircuitBreak(3)).toBe(true);
        expect(shouldCircuitBreak(2)).toBe(false);
    });
    it("aborts on hard failure when at threshold - 1", () => {
        const stateAtThreshold = {
            ...createInitialState(),
            status: "running",
            consecutiveFailures: 2,
            consecutiveErrors: 1,
            currentIteration: 2,
            failCount: 2,
        };
        const afterFailure = transition(stateAtThreshold, {
            type: "iteration_hard_failure",
            error: "Timeout",
            tokenUsage: zeroTokens,
        });
        expect(afterFailure.state.status).toBe("aborted");
        expect(afterFailure.state.consecutiveFailures).toBe(3);
        const abortEffect = afterFailure.effects.find((e) => e.type === "abort");
        expect(abortEffect).toBeDefined();
    });
});
// ---------------------------------------------------------------------------
// 4. User interrupt
// ---------------------------------------------------------------------------
describe("User interrupt: running → user_interrupt → rollback + stop", () => {
    it("produces rollback + stop effects and sets status to stopped", () => {
        const initial = createInitialState();
        const { state: running } = transition(initial, { type: "start", limits: {} });
        const afterInterrupt = transition(running, { type: "user_interrupt" });
        expect(afterInterrupt.state.status).toBe("stopped");
        expect(afterInterrupt.effects).toEqual([{ type: "rollback" }, { type: "stop" }]);
    });
    it("handles interrupt during waiting (backoff) state", () => {
        const waitingState = {
            ...createInitialState(),
            status: "waiting",
            consecutiveFailures: 1,
            consecutiveErrors: 1,
            currentIteration: 1,
            failCount: 1,
        };
        const afterInterrupt = transition(waitingState, { type: "user_interrupt" });
        expect(afterInterrupt.state.status).toBe("stopped");
        expect(afterInterrupt.effects).toEqual([{ type: "rollback" }, { type: "stop" }]);
    });
});
// ---------------------------------------------------------------------------
// 5. Cross-module data flow
// ---------------------------------------------------------------------------
describe("Cross-module data flow: modules work together correctly", () => {
    it("builds agent output schema, validates sample output, formats as notes, round-trips", () => {
        // Step 1: Build an agent output schema
        const schema = buildAgentOutputSchema({ includeStopField: false });
        expect(schema.type).toBe("object");
        expect(schema.additionalProperties).toBe(false);
        expect(schema.properties.success).toBeDefined();
        expect(schema.properties.summary).toBeDefined();
        expect(schema.properties.key_changes_made).toBeDefined();
        expect(schema.properties.key_learnings).toBeDefined();
        // Step 2: Validate a sample output against the schema structure
        const sampleOutput = {
            success: true,
            summary: "Refactored auth module",
            key_changes_made: ["Extracted token validation", "Added refresh logic"],
            key_learnings: ["JWT refresh tokens need rotation"],
        };
        const validationResult = validateAgentOutput(sampleOutput);
        expect(validationResult.valid).toBe(true);
        // Step 3: Format the output as a notes entry
        const entry = {
            number: 1,
            success: sampleOutput.success,
            summary: sampleOutput.summary,
            keyChanges: sampleOutput.key_changes_made,
            keyLearnings: sampleOutput.key_learnings,
        };
        const entryMarkdown = formatIterationEntry(entry);
        expect(entryMarkdown).toContain("### Iteration 1");
        expect(entryMarkdown).toContain("Refactored auth module");
        expect(entryMarkdown).toContain("Extracted token validation");
        expect(entryMarkdown).toContain("JWT refresh tokens need rotation");
        // Step 4: Verify notes round-trip
        const doc = { runId: "cross-module-test", entries: [entry] };
        const markdown = formatNotesDocument(doc);
        const parsed = parseNotesDocument(markdown);
        expect(parsed.runId).toBe("cross-module-test");
        expect(parsed.entries[0].summary).toBe("Refactored auth module");
        expect(parsed.entries[0].keyChanges).toEqual([
            "Extracted token validation",
            "Added refresh logic",
        ]);
        // Step 5: Build a commit command with the formatted message
        const commitMessage = formatCommitMessage(1, sampleOutput.summary);
        const gitCmd = buildCommitCommand(commitMessage);
        // Step 6: Verify the git command is safe
        expect(gitCmd.executable).toBe("git");
        expect(gitCmd.args[0]).toBe("commit");
        expect(gitCmd.args[1]).toBe("-m");
        expect(gitCmd.args[2]).toBe(commitMessage);
        expect(gitCmd.args[2]).toContain("1");
        expect(gitCmd.args[2]).toContain("Refactored auth module");
    });
    it("handles abort conditions across orchestrator and failure handler", () => {
        // Start a run with maxIterations limit
        const initial = createInitialState();
        const { state: running } = transition(initial, { type: "start", limits: {} });
        // Succeed once
        const { state: afterFirst } = transition(running, {
            type: "iteration_success",
            summary: "Step 1 done",
            tokenUsage: smallTokenUsage,
        }, { maxIterations: 2 });
        expect(afterFirst.currentIteration).toBe(1);
        // Succeed again — should hit maxIterations
        const afterSecond = transition(afterFirst, {
            type: "iteration_success",
            summary: "Step 2 done",
            tokenUsage: smallTokenUsage,
        }, { maxIterations: 2 });
        expect(afterSecond.state.status).toBe("aborted");
        expect(afterSecond.state.currentIteration).toBe(2);
        const abortEffect = afterSecond.effects.find((e) => e.type === "abort");
        expect(abortEffect).toBeDefined();
        expect(abortEffect.reason).toContain("max iterations");
        // Verify shouldAbort agrees
        const reason = shouldAbort(afterSecond.state, { maxIterations: 2 });
        expect(reason).toContain("max iterations");
    });
    it("handles token limit abort across iterations", () => {
        const initial = createInitialState();
        const { state: running } = transition(initial, { type: "start", limits: {} });
        const largeTokenUsage = {
            inputTokens: 5000,
            outputTokens: 5000,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
        };
        // First iteration uses 10000 tokens total
        const afterFirst = transition(running, {
            type: "iteration_success",
            summary: "Heavy computation",
            tokenUsage: largeTokenUsage,
        }, { maxTokens: 10_000 });
        // Should abort because totalInputTokens + totalOutputTokens >= maxTokens
        expect(afterFirst.state.status).toBe("aborted");
        expect(afterFirst.state.totalInputTokens).toBe(5000);
        expect(afterFirst.state.totalOutputTokens).toBe(5000);
        const abortEffect = afterFirst.effects.find((e) => e.type === "abort");
        expect(abortEffect).toBeDefined();
        expect(abortEffect.reason).toContain("max tokens");
    });
});
//# sourceMappingURL=loop-integration.test.js.map