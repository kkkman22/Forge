/**
 * SDK Skill-Aware Iteration — extracted skill-aware iteration logic from SdkDriver.
 *
 * Contains the `executeSkillAwareIteration` standalone async function that was
 * previously the `SdkDriver.executeSkillAwareIteration()` private method (~330 lines).
 *
 * The function accepts a `SkillIterationContext` parameter (bundling all dependencies)
 * and returns a `Promise<IterationResult>` describing the state mutations the
 * caller should apply.
 *
 * Design reference: sdk-driver-decomposition § design.md
 * **Validates: Requirements 4.1, 4.2, 10.6**
 */
import { buildSkillAwarePrompt } from "./context-accumulator.js";
import { FrozenZoneViolation } from "./effect-executor.js";
import { buildEntry } from "./event-log.js";
import { transition } from "./orchestrator.js";
import { applySkillAwareCommitStrategy } from "./sdk-commit-strategy.js";
import { appendAndPersistNotes, buildIterationEntry } from "./sdk-notes-manager.js";
import { evaluateGateForPhase } from "./sdk-quality-helpers.js";
import { getPhaseFromStatus, getTierFromStatus, safeReadStatusFile, safeUpdateIterationStatus, } from "./sdk-status-helpers.js";
import { determineNextSkill } from "./skill-scheduler.js";
import { extractLoopFields } from "./status-file-ext.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ZERO_TOKEN_USAGE = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
};
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/**
 * Evaluate the appropriate quality gate for a completed skill phase.
 *
 * Reads the relevant file content via configured callbacks on the config
 * and delegates to the pure-function gate evaluators. Returns null if no
 * gate applies to the given phase or if file-reading callbacks are not
 * configured.
 *
 * Replicates the exact behavior of the original
 * `SdkDriver.evaluateQualityGateForPhase` private method.
 */
function evaluateQualityGateForPhase(phase, ctx) {
    return evaluateGateForPhase(phase, {
        readReview: () => readFileContent(ctx.config.readReviewFile),
        readTest: () => readFileContent(ctx.config.readTestFile),
        readProgress: () => readFileContent(ctx.config.readProgressFile),
    });
}
/**
 * Read file content via a configured callback.
 * Returns null if no callback is configured or if reading fails.
 */
export function readFileContent(reader) {
    if (!reader)
        return null;
    try {
        return reader();
    }
    catch {
        return null;
    }
}
// ---------------------------------------------------------------------------
// executeSkillAwareIteration
// ---------------------------------------------------------------------------
/**
 * Execute a single skill-aware iteration of the autonomous loop.
 *
 * This function encapsulates the full lifecycle of one skill-aware iteration:
 * 1. Read StatusFile to determine next skill phase via `determineNextSkill`
 * 2. Restore PUA context when PUA is enabled
 * 3. Build a skill-aware prompt via `buildSkillAwarePrompt`
 * 4. Invoke the agent adapter
 * 5. Evaluate quality gates for the completed phase
 * 6. Dispatch the resulting event to the orchestrator state machine
 * 7. Apply skill-aware commit strategy (replace/remove commit effects)
 * 8. Execute the resulting effects
 * 9. Handle PUA success/failure paths
 * 10. Append the iteration entry to notes and persist
 * 11. Record performance timing
 *
 * All state mutations are tracked locally and returned in the `IterationResult`.
 * The caller (`SdkDriver`) applies them to its private fields.
 *
 * @param ctx - The skill iteration context bundling all dependencies.
 * @returns The iteration result describing state mutations.
 */
export async function executeSkillAwareIteration(ctx) {
    // Snapshot mutable state locally so we can track mutations.
    let orchestratorState = ctx.orchestratorState;
    let notesDocument = ctx.notesDocument;
    let notesContent = ctx.notesContent;
    let reviewFixAttempts = ctx.reviewFixAttempts;
    let loopCompletedNormally = false;
    const iterationNumber = orchestratorState.currentIteration + 1;
    const iterStartMs = Date.now();
    const puaEnabled = ctx.puaEnabled;
    // Read current StatusFile to determine next skill phase.
    const statusContent = safeReadStatusFile(ctx.statusFileIO);
    const loopFields = extractLoopFields(statusContent);
    // --- PUA: Before iteration — restore state from StatusFile ---
    let puaContext;
    if (puaEnabled && ctx.puaStateManager) {
        puaContext = ctx.puaStateManager.restoreContext(statusContent, orchestratorState.consecutiveFailures);
    }
    const schedulerResult = determineNextSkill({
        currentPhase: loopFields.mode ? (getPhaseFromStatus(statusContent) ?? undefined) : undefined,
        tier: ctx.config.presetTier ?? getTierFromStatus(statusContent),
        planStatus: undefined, // Plan status is determined by the agent
        hasIncompleteTasks: undefined,
        reviewResult: undefined,
        testPassed: undefined,
        reviewFixAttempts,
        maxReviewFixAttempts: ctx.config.loopConfig.maxConsecutiveFailures,
    });
    // If the scheduler says completed or aborted, signal the agent.
    const nextPhase = schedulerResult.nextPhase;
    // Track normal completion for StatusFile cleanup (Req 6.3, 6.4).
    if (nextPhase === "completed") {
        loopCompletedNormally = true;
    }
    // --- PUA: Build prompt with puaContext when available ---
    const prompt = buildSkillAwarePrompt({
        base: {
            iteration: iterationNumber,
            runId: ctx.config.runId,
            objective: ctx.config.objective,
            notesContent,
            stopWhen: ctx.config.limits.stopWhen,
        },
        skill: {
            phase: nextPhase === "completed" || nextPhase === "aborted" ? "" : nextPhase,
            tier: ctx.config.presetTier ?? "standard",
            taskType: ctx.config.presetTaskType,
            projectPhase: ctx.config.presetProjectPhase,
            workNature: ctx.config.presetWorkNature,
        },
        puaContext,
    });
    // Use the abort signal from the context (SdkDriver passes its
    // currentAbortController's signal so that requestStop() can abort
    // in-flight agent calls).
    const signal = ctx.abortSignal;
    let event;
    let iterationEntry;
    let iterationSuccess = false;
    let iterationSummary = "";
    let completedPhase;
    let agentEndMs = iterStartMs;
    try {
        // Invoke the agent adapter with subagent timing.
        const subagentStartMs = Date.now();
        const agentResult = await ctx.agentAdapter.run(prompt, ctx.config.cwd, {
            signal,
        });
        agentEndMs = Date.now();
        // Record subagent timing (Req 4.1, 4.2, 4.3).
        ctx.perfTracker.recordSubagentTiming(ctx.agentAdapter.name, subagentStartMs, agentEndMs, iterationNumber);
        const output = agentResult.output;
        const usage = agentResult.usage;
        // Evaluate quality gates based on the completed skill phase.
        // This overrides any agent-reported gate_result with an independent evaluation.
        completedPhase = output.skill_phase_completed;
        if (completedPhase) {
            const gateResult = evaluateQualityGateForPhase(completedPhase, ctx);
            if (gateResult) {
                output.gate_result = gateResult.status;
            }
        }
        // Update reviewFixAttempts based on gate_result.
        if (output.gate_result === "passed") {
            reviewFixAttempts = 0;
        }
        else if (output.gate_result === "blocked") {
            reviewFixAttempts++;
        }
        if (output.should_fully_stop) {
            // Stop condition met — dispatch stop_condition_met event.
            // Mark as normal completion for StatusFile cleanup (Req 6.3).
            loopCompletedNormally = true;
            const stopResult = transition(orchestratorState, { type: "stop_condition_met" }, ctx.limits);
            orchestratorState = stopResult.state;
            const lastEffects = stopResult.effects;
            await ctx.executeEffects(stopResult.effects);
            // Still record the iteration entry.
            iterationEntry = buildIterationEntry(iterationNumber, true, output);
            ({ notesDocument, notesContent } = appendAndPersistNotes(notesDocument, notesContent, iterationEntry, ctx.config.notesPath, usage, ctx.logger, orchestratorState, (key, params) => ctx.t(key, params), ctx.config.runId));
            // PUA: success path — clear state on stop
            if (puaEnabled) {
                ctx.puaStateManager?.handleSuccess();
            }
            // Update StatusFile (non-critical).
            safeUpdateIterationStatus(ctx.statusFileIO, nextPhase, iterationNumber);
            return {
                orchestratorState,
                notesDocument,
                notesContent,
                lastEffects,
                reviewFixAttempts,
                loopCompletedNormally,
            };
        }
        if (output.success) {
            // If a test or ship gate returned "blocked", override to soft failure
            // even though the agent reported success (Req 4.5, 4.7).
            const isGateBlocked = output.gate_result === "blocked";
            const isTestOrShipPhase = completedPhase === "test" || completedPhase === "ship";
            if (isGateBlocked && isTestOrShipPhase) {
                event = {
                    type: "iteration_soft_failure",
                    summary: output.summary,
                    tokenUsage: usage,
                };
                iterationEntry = buildIterationEntry(iterationNumber, false, output);
                iterationSuccess = false;
                iterationSummary = output.summary;
            }
            else {
                event = {
                    type: "iteration_success",
                    summary: output.summary,
                    tokenUsage: usage,
                };
                iterationEntry = buildIterationEntry(iterationNumber, true, output);
                iterationSuccess = true;
                iterationSummary = output.summary;
            }
        }
        else {
            event = {
                type: "iteration_soft_failure",
                summary: output.summary,
                tokenUsage: usage,
            };
            iterationEntry = buildIterationEntry(iterationNumber, false, output);
            iterationSuccess = false;
            iterationSummary = output.summary;
        }
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const zeroUsage = ZERO_TOKEN_USAGE;
        event = {
            type: "iteration_hard_failure",
            error: errorMessage,
            tokenUsage: zeroUsage,
        };
        iterationEntry = {
            number: iterationNumber,
            success: false,
            summary: errorMessage,
            keyChanges: [],
            keyLearnings: [],
        };
        iterationSuccess = false;
        iterationSummary = errorMessage;
        // PUA: escalate pressure on hard failure (Req 17.1)
        if (puaEnabled) {
            ctx.puaStateManager?.handleFailure(errorMessage, orchestratorState.consecutiveFailures);
        }
    }
    // Dispatch the event to the state machine.
    const result = transition(orchestratorState, event, ctx.limits);
    // Save pre-transition state in case effect execution fails.
    const preTransitionState = orchestratorState;
    orchestratorState = result.state;
    // Apply skill-aware commit strategy: replace/remove commit effects based on
    // shouldCommitForPhase() and use phase-specific commit messages (Req 7.1–7.7).
    const effectivePhase = completedPhase ?? nextPhase;
    const commitResult = applySkillAwareCommitStrategy(result.effects, effectivePhase, iterationSuccess, iterationNumber, iterationSummary, ctx.config.objective, orchestratorState.commitCount);
    const adjustedEffects = commitResult.effects;
    if (commitResult.stateAdjustment) {
        orchestratorState = {
            ...orchestratorState,
            commitCount: commitResult.stateAdjustment.commitCount,
        };
    }
    // Append a write_event_log effect so the skill-aware iteration's
    // event stream is also persisted for replay (Requirement 3.1, 3.5).
    const logEntry = buildEntry(ctx.config.runId, preTransitionState.currentIteration, event, preTransitionState, result.state, adjustedEffects);
    const effectsWithLog = [
        ...adjustedEffects,
        { type: "write_event_log", entry: logEntry },
    ];
    let lastEffects = effectsWithLog;
    // Execute the resulting effects (commit/rollback, schedule_iteration, etc.).
    // If effect execution fails (e.g., commit throws), revert to pre-transition
    // state and dispatch iteration_hard_failure instead.
    try {
        await ctx.executeEffects(effectsWithLog);
    }
    catch (effectError) {
        const effectMessage = effectError instanceof Error ? effectError.message : String(effectError);
        // FrozenZoneViolation: terminate loop directly without backoff (Req 8.2).
        if (effectError instanceof FrozenZoneViolation) {
            const abortResult = transition(orchestratorState, { type: "stop_condition_met" }, ctx.limits);
            orchestratorState = abortResult.state;
            lastEffects = abortResult.effects;
            await ctx.executeEffects(abortResult.effects);
            iterationEntry = {
                number: iterationEntry.number,
                success: false,
                summary: `Frozen zone violation — loop terminated: ${effectMessage}`,
                keyChanges: [],
                keyLearnings: [],
            };
            ({ notesDocument, notesContent } = appendAndPersistNotes(notesDocument, notesContent, iterationEntry, ctx.config.notesPath));
            // Update StatusFile with current phase and iteration (non-critical).
            safeUpdateIterationStatus(ctx.statusFileIO, nextPhase, iterationNumber);
            return {
                orchestratorState,
                notesDocument,
                notesContent,
                lastEffects,
                reviewFixAttempts,
                loopCompletedNormally,
            };
        }
        // UnexpectedEffectError or any other error: trigger iteration_hard_failure + backoff (Req 8.3).
        // Revert to pre-transition state so that commitCount is not incremented.
        orchestratorState = preTransitionState;
        // Dispatch iteration_hard_failure from the original state.
        const zeroUsage = ZERO_TOKEN_USAGE;
        const failureResult = transition(orchestratorState, { type: "iteration_hard_failure", error: effectMessage, tokenUsage: zeroUsage }, ctx.limits);
        orchestratorState = failureResult.state;
        lastEffects = failureResult.effects;
        // Execute the failure effects (rollback + backoff).
        await ctx.executeEffects(failureResult.effects);
        // Record the effect failure in the iteration's notes entry.
        iterationEntry = {
            number: iterationEntry.number,
            success: false,
            summary: `Effect execution failed: ${effectMessage}`,
            keyChanges: [],
            keyLearnings: [],
        };
        ({ notesDocument, notesContent } = appendAndPersistNotes(notesDocument, notesContent, iterationEntry, ctx.config.notesPath));
        // PUA: treat effect failure as a failure path
        if (puaEnabled) {
            ctx.puaStateManager?.handleFailure(`Effect execution failed: ${effectMessage}`, orchestratorState.consecutiveFailures);
        }
        // Update StatusFile with current phase and iteration (non-critical).
        safeUpdateIterationStatus(ctx.statusFileIO, nextPhase, iterationNumber);
        return {
            orchestratorState,
            notesDocument,
            notesContent,
            lastEffects,
            reviewFixAttempts,
            loopCompletedNormally,
        };
    }
    // Append iteration entry to notes and persist.
    ({ notesDocument, notesContent } = appendAndPersistNotes(notesDocument, notesContent, iterationEntry, ctx.config.notesPath, "tokenUsage" in event ? event.tokenUsage : undefined, ctx.logger, orchestratorState, (key, params) => ctx.t(key, params), ctx.config.runId));
    // --- PUA: After iteration — handle success/failure paths ---
    if (puaEnabled) {
        if (iterationSuccess) {
            ctx.puaStateManager?.handleSuccess();
        }
        else {
            ctx.puaStateManager?.handleFailure(iterationSummary, orchestratorState.consecutiveFailures);
        }
    }
    // Update StatusFile with current phase and iteration (non-critical).
    safeUpdateIterationStatus(ctx.statusFileIO, nextPhase, iterationNumber);
    // Record iteration timing (Req 4.1–4.4) with phase metadata (Req 3.1, 3.3).
    const effectEndMs = Date.now();
    ctx.perfTracker.recordIterationTiming(iterStartMs, agentEndMs, effectEndMs, iterationNumber, nextPhase);
    return {
        orchestratorState,
        notesDocument,
        notesContent,
        lastEffects,
        reviewFixAttempts,
        loopCompletedNormally,
    };
}
//# sourceMappingURL=sdk-skill-iteration.js.map