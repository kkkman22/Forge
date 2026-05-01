/**
 * SDK Driver — the core autonomous loop driver that bridges the pure-function
 * state machine with real I/O via the Agent SDK and effect executor.
 *
 * The driver owns the `while` loop, orchestrator state, and notes document.
 * It delegates all I/O to the effect executor and agent adapter, keeping
 * itself focused on event dispatch and loop control.
 *
 * Design reference: sdk-autonomous-loop § sdk-driver.ts
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 2.1–2.7, 3.1–3.7,
 *   4.1–4.6, 5.1–5.4, 8.1–8.4, 9.1–9.3, 10.1–10.5**
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path, { join } from "node:path";
import { formatCompletionSummary } from "./completion-reporter.js";
import { appendEntry, buildIterationPrompt, buildSkillAwarePrompt, formatNotesDocument, } from "./context-accumulator.js";
import { FrozenZoneViolation } from "./effect-executor.js";
import { createLogEntry, createLogSink } from "./logger/index.js";
import { createInitialState, transition } from "./orchestrator.js";
import { PerformanceTracker } from "./performance-tracker.js";
import { PuaStateManager } from "./pua-state-manager.js";
import { RunManager } from "./run-manager.js";
import { buildDefaultPolicy, validatePolicy } from "./sandbox-policy.js";
import { evaluateGateForPhase } from "./sdk-quality-helpers.js";
import { clearLoopFieldsOnShutdown, getPhaseFromStatus, getTierFromStatus, initializeLoopFields, safeReadStatusFile, safeUpdateIterationStatus as safeUpdateIterationStatusHelper, } from "./sdk-status-helpers.js";
import { determineNextSkill, shouldCommitForPhase } from "./skill-scheduler.js";
import { extractLoopFields } from "./status-file-ext.js";
const ZERO_TOKEN_USAGE = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
};
// ---------------------------------------------------------------------------
// Sandbox policy loading
// ---------------------------------------------------------------------------
/**
 * Load sandbox policy from .forge/sandbox.json or return default.
 * Validates the config and falls back to default on validation failure.
 */
function loadSandboxPolicy(cwd) {
    const configPath = join(cwd, ".forge", "sandbox.json");
    if (existsSync(configPath)) {
        try {
            const raw = JSON.parse(readFileSync(configPath, "utf-8"));
            const validation = validatePolicy(raw);
            if (validation.valid) {
                return raw;
            }
            // Log validation errors but continue with default
        }
        catch {
            // Parse error — fall back to default
        }
    }
    return buildDefaultPolicy(cwd);
}
// ---------------------------------------------------------------------------
// Hooks validation
// ---------------------------------------------------------------------------
/**
 * Validate that the hooks configuration file exists and contains a
 * `PreToolUse` section. This is a pure-function check used at startup
 * to warn when the outer protection layer (hooks) is missing.
 *
 * @param cwd - The working directory (repository root) to check.
 * @returns An object with `valid: true` if hooks are present, or
 *   `valid: false` with a `reason` string explaining the issue.
 */
export function validateHooksPresence(cwd) {
    const hooksPath = join(cwd, "hooks", "hooks.json");
    if (!existsSync(hooksPath)) {
        return { valid: false, reason: "hooks/hooks.json not found" };
    }
    try {
        const content = readFileSync(hooksPath, "utf-8");
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed?.hooks?.PreToolUse)) {
            return { valid: false, reason: "PreToolUse section missing in hooks.json" };
        }
        return { valid: true };
    }
    catch {
        return { valid: false, reason: "hooks.json parse failed" };
    }
}
// ---------------------------------------------------------------------------
// SdkDriver class
// ---------------------------------------------------------------------------
/**
 * Core autonomous loop driver.
 *
 * Bridges the pure-function state machine (`orchestrator.ts`) with real I/O
 * via the effect executor and agent adapter. Owns the main `while` loop,
 * orchestrator state, and notes document.
 */
export class SdkDriver {
    config;
    effectExecutor;
    agentAdapter;
    orchestratorState;
    notesDocument;
    notesContent;
    /** The most recent set of effects from the last transition. */
    lastEffects = [];
    /** AbortController for the current iteration's agent invocation. */
    currentAbortController = null;
    /** Flag indicating requestStop() has been called. */
    stopRequested = false;
    /** Cleanup promise from requestStop(), awaitable by callers. */
    stopPromise = null;
    /** Counter for consecutive review-fix loop iterations (skill-aware mode). */
    reviewFixAttempts = 0;
    /** Tracks whether the loop completed normally (SkillScheduler returned "completed"). */
    loopCompletedNormally = false;
    /** PUA state manager (only instantiated when puaEnabled is true). */
    puaStateManager = null;
    /** StatusFile I/O interface for delegating to helper functions. */
    statusFileIO;
    /** Structured logger for observability. */
    logger;
    /** Performance tracker for iteration/subagent timing and degradation detection. */
    perfTracker;
    constructor(config, effectExecutor, agentAdapter) {
        // Validate objective is non-empty after trimming.
        if (!config.objective.trim()) {
            throw new Error("Objective must be a non-empty string");
        }
        // Default skillAware to false if not provided.
        this.config = { ...config, skillAware: config.skillAware ?? false };
        this.effectExecutor = effectExecutor;
        this.agentAdapter = agentAdapter;
        // Initialize structured logger.
        this.logger = createLogSink(config.logSinkConfig ?? { format: "text", level: "info" });
        // Initialize performance tracker.
        this.perfTracker = new PerformanceTracker(this.logger, config.runId);
        // Initialize orchestrator state.
        this.orchestratorState = createInitialState();
        // Initialize empty notes document.
        this.notesDocument = { runId: config.runId, branchName: config.branchName, entries: [] };
        this.notesContent = formatNotesDocument(this.notesDocument);
        // Initialize StatusFile IO interface from config callbacks.
        this.statusFileIO =
            config.readStatusFile && config.writeStatusFile
                ? { read: config.readStatusFile, write: config.writeStatusFile }
                : undefined;
        // Initialize PUA state manager when PUA is enabled.
        if (config.puaEnabled) {
            this.puaStateManager = new PuaStateManager({
                readStatusFile: () => safeReadStatusFile(this.statusFileIO),
                writeStatusFile: (content) => {
                    if (this.statusFileIO)
                        this.statusFileIO.write(content);
                },
                warn: (msg) => this.logger.log(createLogEntry("pua_warning", "warn", msg, { runId: this.config.runId })),
            }, config.puaTaskType ?? "general");
        }
    }
    /**
     * Internal translation helper. Falls back to the key-based default
     * when no translation function is configured.
     */
    t(key, params) {
        if (this.config.t) {
            return this.config.t(key, params);
        }
        // Fallback: use the English default strings when no t() is provided.
        return key;
    }
    /**
     * Run the autonomous loop until a termination condition is met.
     *
     * The loop continues while the orchestrator state is `running` or `waiting`.
     * It exits when the state transitions to `aborted` or `stopped`, or when
     * the effect executor sets its `aborted` or `stopped` flags.
     *
     * @returns The final driver result with state, notes, and commit count.
     */
    async run() {
        // Validate hooks presence at startup (non-blocking).
        try {
            const hooksResult = validateHooksPresence(this.config.cwd);
            if (!hooksResult.valid) {
                this.logger.log(createLogEntry("hooks_missing", "warn", this.t("driver.warning.hooksProtectionMissing", {
                    reason: hooksResult.reason ?? "unknown",
                }), { runId: this.config.runId }));
            }
        }
        catch (err) {
            this.logger.log(createLogEntry("hooks_validation_failed", "warn", this.t("driver.warning.hooksProtectionMissing", {
                reason: `unexpected error during hooks validation — ${err instanceof Error ? err.message : String(err)}`,
            }), { runId: this.config.runId }));
        }
        // Skill-aware startup: write Loop fields to StatusFile (Req 6.1, 6.5, 10.5).
        if (this.config.skillAware) {
            try {
                initializeLoopFields(this.statusFileIO, this.config.runId, this.config.presetTier ?? "standard");
            }
            catch (err) {
                this.logger.log(createLogEntry("status_field_init_failed", "warn", this.t("driver.warning.statusFieldInitFailed", {
                    error: err instanceof Error ? err.message : String(err),
                }), { runId: this.config.runId }));
            }
        }
        // Sandbox mode: write runtime policy file for PreToolUse hook.
        if (this.config.sandboxEnabled) {
            try {
                const sandboxActivePath = path.join(this.config.cwd, ".forge", ".sandbox-active.json");
                const policy = loadSandboxPolicy(this.config.cwd);
                mkdirSync(path.dirname(sandboxActivePath), { recursive: true });
                writeFileSync(sandboxActivePath, JSON.stringify({ projectRoot: this.config.cwd, policy }));
                this.logger.log(createLogEntry("sandbox_enabled", "info", "Sandbox mode activated", {
                    runId: this.config.runId,
                }));
            }
            catch (err) {
                this.logger.log(createLogEntry("sandbox_init_failed", "warn", `Sandbox init failed: ${err instanceof Error ? err.message : String(err)}`, { runId: this.config.runId }));
            }
        }
        try {
            // Dispatch the start event to kick off the state machine.
            const startResult = transition(this.orchestratorState, { type: "start", limits: this.config.limits }, this.config.limits);
            this.orchestratorState = startResult.state;
            this.lastEffects = startResult.effects;
            await this.executeEffects(startResult.effects);
            // Main loop: continue while running or waiting.
            while (this.isLoopActive() &&
                !this.effectExecutor.aborted &&
                !this.effectExecutor.stopped &&
                !this.stopRequested) {
                // Check for schedule_iteration effect.
                if (this.hasEffect(this.lastEffects, "schedule_iteration")) {
                    await this.executeIteration();
                    // Timing is recorded inside each execute*Iteration method
                    continue;
                }
                // Check for start_backoff effect — it was already executed by
                // executeEffects; now dispatch the elapsed event.
                if (this.hasEffect(this.lastEffects, "start_backoff")) {
                    const backoffResult = transition(this.orchestratorState, { type: "backoff_elapsed" }, this.config.limits);
                    this.orchestratorState = backoffResult.state;
                    this.lastEffects = backoffResult.effects;
                    await this.executeEffects(backoffResult.effects);
                    continue;
                }
                // No actionable effects remain — break to avoid infinite loop.
                break;
            }
            return this.buildResult();
        }
        finally {
            // Output performance baseline (Req 5.1–5.4, 6.1, 6.2, 6.4, 6.7).
            // Computed once and reused in formatCompletionSummary (Req 5.2).
            const baseline = this.perfTracker.computeBaseline();
            this.logger.log(createLogEntry("performance_baseline", "info", "Run performance summary", {
                runId: this.config.runId,
            }, { ...baseline }));
            // Output structured completion/abort summary (Req 9.1–9.5).
            // Placed in finally block so it runs on both normal and abnormal exits.
            if (this.config.skillAware) {
                try {
                    const completionCtx = {
                        status: this.orchestratorState.status,
                        currentIteration: this.orchestratorState.currentIteration,
                        notesDocument: this.notesDocument,
                        objective: this.config.objective,
                        branchName: this.config.branchName,
                        presetTier: this.config.presetTier ?? "standard",
                        loopCompletedNormally: this.loopCompletedNormally,
                        reviewFixAttempts: this.reviewFixAttempts,
                        maxConsecutiveFailures: this.config.loopConfig.maxConsecutiveFailures,
                        readReviewFile: this.config.readReviewFile,
                        t: (key, params) => this.t(key, params),
                    };
                    const summary = formatCompletionSummary(completionCtx, baseline);
                    this.logger.log(createLogEntry("completion_summary", "info", summary, { runId: this.config.runId }));
                }
                catch (err) {
                    this.logger.log(createLogEntry("completion_summary_failed", "warn", "Failed to format completion summary", {
                        runId: this.config.runId,
                    }, { error: err instanceof Error ? err.message : String(err) }));
                }
            }
            // Skill-aware cleanup: clear Loop fields from StatusFile when loop ends.
            if (this.config.skillAware) {
                try {
                    clearLoopFieldsOnShutdown(this.statusFileIO, this.loopCompletedNormally);
                }
                catch (err) {
                    this.logger.log(createLogEntry("status_field_clear_failed", "warn", "Failed to clear loop status fields", {
                        runId: this.config.runId,
                    }, { error: err instanceof Error ? err.message : String(err) }));
                }
            }
            // PUA cleanup: clear PUA fields from StatusFile when loop ends.
            if (this.config.puaEnabled) {
                try {
                    this.puaStateManager?.safeClearFields();
                }
                catch (err) {
                    this.logger.log(createLogEntry("pua_field_clear_failed", "warn", "Failed to clear PUA fields", {
                        runId: this.config.runId,
                    }, { error: err instanceof Error ? (err.stack ?? err.message) : String(err) }));
                }
            }
            // Sandbox cleanup: remove runtime policy file.
            if (this.config.sandboxEnabled) {
                try {
                    const sandboxActivePath = path.join(this.config.cwd, ".forge", ".sandbox-active.json");
                    rmSync(sandboxActivePath, { force: true });
                }
                catch {
                    // Non-critical: stale file won't affect future runs if sandbox is not enabled.
                }
            }
            // Cleanup: abort any in-flight agent invocation.
            if (this.currentAbortController) {
                this.currentAbortController.abort("driver shutdown");
                this.currentAbortController = null;
            }
        }
    }
    /**
     * Signal the driver to stop gracefully.
     *
     * Dispatches a `user_interrupt` event to the state machine, executes
     * the resulting effects, and aborts the current agent invocation.
     */
    requestStop() {
        this.stopRequested = true;
        // Abort the current agent invocation if one is in progress.
        if (this.currentAbortController) {
            this.currentAbortController.abort("user interrupt");
        }
        // Dispatch user_interrupt event to the state machine.
        const result = transition(this.orchestratorState, { type: "user_interrupt" }, this.config.limits);
        this.orchestratorState = result.state;
        this.lastEffects = result.effects;
        // Execute effects (rollback + stop) — fire and forget since
        // requestStop is called from signal handlers.
        this.stopPromise = this.executeEffects(result.effects);
    }
    /** Returns the cleanup promise from the last requestStop() call. */
    getStopPromise() {
        return this.stopPromise ?? null;
    }
    // -------------------------------------------------------------------------
    // Private: loop helpers
    // -------------------------------------------------------------------------
    /** Check if the loop should continue running. */
    isLoopActive() {
        const { status } = this.orchestratorState;
        return status === "running" || status === "waiting";
    }
    /** Check if a specific effect type exists in an effects array. */
    hasEffect(effects, type) {
        return effects.some((e) => e.type === type);
    }
    // -------------------------------------------------------------------------
    // Private: iteration execution
    // -------------------------------------------------------------------------
    /**
     * Execute a single iteration: build prompt → invoke agent → process result.
     *
     * When `skillAware` is true, delegates to `executeSkillAwareIteration()`.
     * Otherwise, uses the original generic iteration logic.
     */
    async executeIteration() {
        if (this.config.skillAware) {
            return this.executeSkillAwareIteration();
        }
        return this.executeGenericIteration();
    }
    /**
     * Original generic iteration logic (non-skill-aware).
     */
    async executeGenericIteration() {
        const iterationNumber = this.orchestratorState.currentIteration + 1;
        const iterStartMs = Date.now();
        // Build the iteration prompt with current notes content.
        const prompt = buildIterationPrompt({
            iteration: iterationNumber,
            runId: this.config.runId,
            objective: this.config.objective,
            notesContent: this.notesContent,
            stopWhen: this.config.limits.stopWhen,
        });
        // Create a fresh AbortController for this iteration.
        this.currentAbortController = new AbortController();
        let event;
        let iterationEntry;
        let agentEndMs = iterStartMs;
        try {
            // Invoke the agent adapter with subagent timing.
            const subagentStartMs = Date.now();
            const agentResult = await this.agentAdapter.run(prompt, this.config.cwd, {
                signal: this.currentAbortController.signal,
            });
            agentEndMs = Date.now();
            // Record subagent timing (Req 4.1, 4.2, 4.3).
            this.perfTracker.recordSubagentTiming(this.agentAdapter.name, subagentStartMs, agentEndMs, iterationNumber);
            const output = agentResult.output;
            const usage = agentResult.usage;
            if (output.should_fully_stop) {
                // Stop condition met — dispatch stop_condition_met event.
                const stopResult = transition(this.orchestratorState, { type: "stop_condition_met" }, this.config.limits);
                this.orchestratorState = stopResult.state;
                this.lastEffects = stopResult.effects;
                await this.executeEffects(stopResult.effects);
                // Still record the iteration entry.
                iterationEntry = this.buildIterationEntry(iterationNumber, true, output);
                this.appendAndPersistNotes(iterationEntry, usage);
                return;
            }
            if (output.success) {
                // Successful iteration.
                event = {
                    type: "iteration_success",
                    summary: output.summary,
                    tokenUsage: usage,
                };
                iterationEntry = this.buildIterationEntry(iterationNumber, true, output);
            }
            else {
                // Soft failure — agent reported success: false.
                event = {
                    type: "iteration_soft_failure",
                    summary: output.summary,
                    tokenUsage: usage,
                };
                iterationEntry = this.buildIterationEntry(iterationNumber, false, output);
            }
        }
        catch (error) {
            // Hard failure — SDK error or validation error.
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
            // PUA: escalate pressure on hard failure (Req 17.2)
            if (this.config.puaEnabled) {
                this.puaStateManager?.handleFailure(errorMessage, this.orchestratorState.consecutiveFailures);
            }
        }
        finally {
            this.currentAbortController = null;
        }
        // Dispatch the event to the state machine.
        const result = transition(this.orchestratorState, event, this.config.limits);
        // Save pre-transition state in case effect execution fails.
        // If effects fail (e.g., commit throws), we revert to the pre-transition
        // state and dispatch iteration_hard_failure instead, ensuring commitCount
        // is NOT incremented for failed commits.
        const preTransitionState = this.orchestratorState;
        this.orchestratorState = result.state;
        this.lastEffects = result.effects;
        // Execute the resulting effects (commit/rollback, schedule_iteration, etc.).
        try {
            await this.executeEffects(result.effects);
        }
        catch (effectError) {
            const effectMessage = effectError instanceof Error ? effectError.message : String(effectError);
            // FrozenZoneViolation: terminate loop directly without backoff (Req 8.2).
            if (effectError instanceof FrozenZoneViolation) {
                const abortResult = transition(this.orchestratorState, { type: "stop_condition_met" }, this.config.limits);
                this.orchestratorState = abortResult.state;
                this.lastEffects = abortResult.effects;
                await this.executeEffects(abortResult.effects);
                iterationEntry = {
                    number: iterationEntry.number,
                    success: false,
                    summary: `Frozen zone violation — loop terminated: ${effectMessage}`,
                    keyChanges: [],
                    keyLearnings: [],
                };
                this.appendAndPersistNotes(iterationEntry);
                return;
            }
            // UnexpectedEffectError or any other error: trigger iteration_hard_failure + backoff (Req 8.3).
            // Revert to pre-transition state so that commitCount is not incremented.
            this.orchestratorState = preTransitionState;
            // Dispatch iteration_hard_failure from the original state — this triggers
            // rollback and does NOT increment commitCount.
            const zeroUsage = ZERO_TOKEN_USAGE;
            const failureResult = transition(this.orchestratorState, { type: "iteration_hard_failure", error: effectMessage, tokenUsage: zeroUsage }, this.config.limits);
            this.orchestratorState = failureResult.state;
            this.lastEffects = failureResult.effects;
            // Execute the failure effects (rollback + backoff).
            await this.executeEffects(failureResult.effects);
            // Record the effect failure in the iteration's notes entry.
            iterationEntry = {
                number: iterationEntry.number,
                success: false,
                summary: `Effect execution failed: ${effectMessage}`,
                keyChanges: [],
                keyLearnings: [],
            };
            this.appendAndPersistNotes(iterationEntry);
            return;
        }
        // Append iteration entry to notes and persist.
        this.appendAndPersistNotes(iterationEntry, "tokenUsage" in event ? event.tokenUsage : undefined);
        // Record iteration timing (Req 4.1–4.4).
        const effectEndMs = Date.now();
        this.perfTracker.recordIterationTiming(iterStartMs, agentEndMs, effectEndMs, iterationNumber, "generic");
    }
    /**
     * Skill-aware iteration logic.
     *
     * Calls `determineNextSkill()` to get the next SKILL phase, then
     * builds a skill-aware prompt via `buildSkillAwarePrompt()`. After
     * the iteration completes, updates the StatusFile and manages the
     * `reviewFixAttempts` counter.
     *
     * When `puaEnabled` is true, integrates PUA quality engine logic:
     * - Before iteration: restores PUA state from StatusFile
     * - Building prompt: passes puaContext to buildSkillAwarePrompt()
     * - After iteration (failure): detects failure pattern, escalates pressure,
     *   selects/advances methodology, persists PUA state
     * - After iteration (success): clears PUA state
     */
    async executeSkillAwareIteration() {
        const iterationNumber = this.orchestratorState.currentIteration + 1;
        const iterStartMs = Date.now();
        const puaEnabled = this.config.puaEnabled === true;
        // Read current StatusFile to determine next skill phase.
        const statusContent = safeReadStatusFile(this.statusFileIO);
        const loopFields = extractLoopFields(statusContent);
        // --- PUA: Before iteration — restore state from StatusFile ---
        let puaContext;
        if (puaEnabled && this.puaStateManager) {
            puaContext = this.puaStateManager.restoreContext(statusContent, this.orchestratorState.consecutiveFailures);
        }
        const schedulerResult = determineNextSkill({
            currentPhase: loopFields.mode ? (getPhaseFromStatus(statusContent) ?? undefined) : undefined,
            tier: this.config.presetTier ?? getTierFromStatus(statusContent),
            planStatus: undefined, // Plan status is determined by the agent
            hasIncompleteTasks: undefined,
            reviewResult: undefined,
            testPassed: undefined,
            reviewFixAttempts: this.reviewFixAttempts,
            maxReviewFixAttempts: this.config.loopConfig.maxConsecutiveFailures,
        });
        // If the scheduler says completed or aborted, signal the agent.
        const nextPhase = schedulerResult.nextPhase;
        // Track normal completion for StatusFile cleanup (Req 6.3, 6.4).
        if (nextPhase === "completed") {
            this.loopCompletedNormally = true;
        }
        // --- PUA: Build prompt with puaContext when available ---
        const prompt = buildSkillAwarePrompt({
            base: {
                iteration: iterationNumber,
                runId: this.config.runId,
                objective: this.config.objective,
                notesContent: this.notesContent,
                stopWhen: this.config.limits.stopWhen,
            },
            skill: {
                phase: nextPhase === "completed" || nextPhase === "aborted" ? "" : nextPhase,
                tier: this.config.presetTier ?? "standard",
                taskType: this.config.presetTaskType,
                projectPhase: this.config.presetProjectPhase,
                workNature: this.config.presetWorkNature,
            },
            puaContext,
        });
        // Create a fresh AbortController for this iteration.
        this.currentAbortController = new AbortController();
        let event;
        let iterationEntry;
        let iterationSuccess = false;
        let iterationSummary = "";
        let completedPhase;
        let agentEndMs = iterStartMs;
        try {
            // Invoke the agent adapter with subagent timing.
            const subagentStartMs = Date.now();
            const agentResult = await this.agentAdapter.run(prompt, this.config.cwd, {
                signal: this.currentAbortController.signal,
            });
            agentEndMs = Date.now();
            // Record subagent timing (Req 4.1, 4.2, 4.3).
            this.perfTracker.recordSubagentTiming(this.agentAdapter.name, subagentStartMs, agentEndMs, iterationNumber);
            const output = agentResult.output;
            const usage = agentResult.usage;
            // Evaluate quality gates based on the completed skill phase.
            // This overrides any agent-reported gate_result with an independent evaluation.
            completedPhase = output.skill_phase_completed;
            if (completedPhase) {
                const gateResult = this.evaluateQualityGateForPhase(completedPhase);
                if (gateResult) {
                    output.gate_result = gateResult.status;
                }
            }
            // Update reviewFixAttempts based on gate_result.
            if (output.gate_result === "passed") {
                this.reviewFixAttempts = 0;
            }
            else if (output.gate_result === "blocked") {
                this.reviewFixAttempts++;
            }
            if (output.should_fully_stop) {
                // Stop condition met — dispatch stop_condition_met event.
                // Mark as normal completion for StatusFile cleanup (Req 6.3).
                this.loopCompletedNormally = true;
                const stopResult = transition(this.orchestratorState, { type: "stop_condition_met" }, this.config.limits);
                this.orchestratorState = stopResult.state;
                this.lastEffects = stopResult.effects;
                await this.executeEffects(stopResult.effects);
                // Still record the iteration entry.
                iterationEntry = this.buildIterationEntry(iterationNumber, true, output);
                this.appendAndPersistNotes(iterationEntry, usage);
                // PUA: success path — clear state on stop
                if (puaEnabled) {
                    this.puaStateManager?.handleSuccess();
                }
                // Update StatusFile (non-critical).
                safeUpdateIterationStatusHelper(this.statusFileIO, nextPhase, iterationNumber);
                return;
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
                    iterationEntry = this.buildIterationEntry(iterationNumber, false, output);
                    iterationSuccess = false;
                    iterationSummary = output.summary;
                }
                else {
                    event = {
                        type: "iteration_success",
                        summary: output.summary,
                        tokenUsage: usage,
                    };
                    iterationEntry = this.buildIterationEntry(iterationNumber, true, output);
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
                iterationEntry = this.buildIterationEntry(iterationNumber, false, output);
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
                this.puaStateManager?.handleFailure(errorMessage, this.orchestratorState.consecutiveFailures);
            }
        }
        finally {
            this.currentAbortController = null;
        }
        // Dispatch the event to the state machine.
        const result = transition(this.orchestratorState, event, this.config.limits);
        // Save pre-transition state in case effect execution fails.
        const preTransitionState = this.orchestratorState;
        this.orchestratorState = result.state;
        // Apply skill-aware commit strategy: replace/remove commit effects based on
        // shouldCommitForPhase() and use phase-specific commit messages (Req 7.1–7.7).
        const effectivePhase = completedPhase ?? nextPhase;
        const adjustedEffects = this.applySkillAwareCommitStrategy(result.effects, effectivePhase, iterationSuccess, iterationNumber, iterationSummary);
        this.lastEffects = adjustedEffects;
        // Execute the resulting effects (commit/rollback, schedule_iteration, etc.).
        // If effect execution fails (e.g., commit throws), revert to pre-transition
        // state and dispatch iteration_hard_failure instead.
        try {
            await this.executeEffects(adjustedEffects);
        }
        catch (effectError) {
            const effectMessage = effectError instanceof Error ? effectError.message : String(effectError);
            // FrozenZoneViolation: terminate loop directly without backoff (Req 8.2).
            if (effectError instanceof FrozenZoneViolation) {
                const abortResult = transition(this.orchestratorState, { type: "stop_condition_met" }, this.config.limits);
                this.orchestratorState = abortResult.state;
                this.lastEffects = abortResult.effects;
                await this.executeEffects(abortResult.effects);
                iterationEntry = {
                    number: iterationEntry.number,
                    success: false,
                    summary: `Frozen zone violation — loop terminated: ${effectMessage}`,
                    keyChanges: [],
                    keyLearnings: [],
                };
                this.appendAndPersistNotes(iterationEntry);
                // Update StatusFile with current phase and iteration (non-critical).
                safeUpdateIterationStatusHelper(this.statusFileIO, nextPhase, iterationNumber);
                return;
            }
            // UnexpectedEffectError or any other error: trigger iteration_hard_failure + backoff (Req 8.3).
            // Revert to pre-transition state so that commitCount is not incremented.
            this.orchestratorState = preTransitionState;
            // Dispatch iteration_hard_failure from the original state.
            const zeroUsage = ZERO_TOKEN_USAGE;
            const failureResult = transition(this.orchestratorState, { type: "iteration_hard_failure", error: effectMessage, tokenUsage: zeroUsage }, this.config.limits);
            this.orchestratorState = failureResult.state;
            this.lastEffects = failureResult.effects;
            // Execute the failure effects (rollback + backoff).
            await this.executeEffects(failureResult.effects);
            // Record the effect failure in the iteration's notes entry.
            iterationEntry = {
                number: iterationEntry.number,
                success: false,
                summary: `Effect execution failed: ${effectMessage}`,
                keyChanges: [],
                keyLearnings: [],
            };
            this.appendAndPersistNotes(iterationEntry);
            // PUA: treat effect failure as a failure path
            if (puaEnabled) {
                this.puaStateManager?.handleFailure(`Effect execution failed: ${effectMessage}`, this.orchestratorState.consecutiveFailures);
            }
            // Update StatusFile with current phase and iteration (non-critical).
            safeUpdateIterationStatusHelper(this.statusFileIO, nextPhase, iterationNumber);
            return;
        }
        // Append iteration entry to notes and persist.
        this.appendAndPersistNotes(iterationEntry, "tokenUsage" in event ? event.tokenUsage : undefined);
        // --- PUA: After iteration — handle success/failure paths ---
        if (puaEnabled) {
            if (iterationSuccess) {
                this.puaStateManager?.handleSuccess();
            }
            else {
                this.puaStateManager?.handleFailure(iterationSummary, this.orchestratorState.consecutiveFailures);
            }
        }
        // Update StatusFile with current phase and iteration (non-critical).
        safeUpdateIterationStatusHelper(this.statusFileIO, nextPhase, iterationNumber);
        // Record iteration timing (Req 4.1–4.4) with phase metadata (Req 3.1, 3.3).
        const effectEndMs = Date.now();
        this.perfTracker.recordIterationTiming(iterStartMs, agentEndMs, effectEndMs, iterationNumber, nextPhase);
    }
    // -------------------------------------------------------------------------
    // Private: quality gate evaluation (skill-aware mode)
    // -------------------------------------------------------------------------
    /**
     * Evaluate the appropriate quality gate for a completed skill phase.
     *
     * Reads the relevant file content via configured callbacks and delegates
     * to the pure-function gate evaluators. Returns null if no gate applies
     * to the given phase or if file-reading callbacks are not configured.
     *
     * @param phase - The skill phase that just completed.
     * @returns The gate evaluation result, or null if no gate applies.
     */
    evaluateQualityGateForPhase(phase) {
        return evaluateGateForPhase(phase, {
            readReview: () => this.readReviewFileContent(),
            readTest: () => this.readTestFileContent(),
            readProgress: () => this.readProgressFileContent(),
        });
    }
    /**
     * Read file content via a configured callback.
     * Returns null if no callback is configured or if reading fails.
     *
     * @param reader - The configured file reader callback, or undefined.
     * @returns File content string, or null.
     */
    readFileContent(reader) {
        if (!reader)
            return null;
        try {
            return reader();
        }
        catch (err) {
            this.logger.log(createLogEntry("read_file_content_failed", "debug", `readFileContent failed: ${err instanceof Error ? err.message : String(err)}`, { runId: this.config.runId }));
            return null;
        }
    }
    /**
     * Read review file content via the configured callback.
     * Returns null if no callback is configured or if reading fails.
     */
    readReviewFileContent() {
        return this.readFileContent(this.config.readReviewFile);
    }
    /**
     * Read test result file content via the configured callback.
     * Returns null if no callback is configured or if reading fails.
     */
    readTestFileContent() {
        return this.readFileContent(this.config.readTestFile);
    }
    /**
     * Read progress file content via the configured callback.
     * Returns null if no callback is configured or if reading fails.
     */
    readProgressFileContent() {
        return this.readFileContent(this.config.readProgressFile);
    }
    // -------------------------------------------------------------------------
    // Private: notes management
    // -------------------------------------------------------------------------
    /** Build an `IterationEntry` from an iteration result. */
    buildIterationEntry(number, success, output) {
        return {
            number,
            success,
            summary: output.summary,
            keyChanges: success ? output.key_changes_made : [],
            keyLearnings: output.key_learnings,
        };
    }
    /** Append an iteration entry to the notes document and persist to disk. */
    appendAndPersistNotes(entry, usage) {
        // Append entry to the notes document.
        this.notesDocument.entries.push(entry);
        this.notesContent = appendEntry(this.notesContent, entry);
        // Persist notes to disk.
        RunManager.persistNotes(this.config.notesPath, this.notesContent);
        // Log token usage if available.
        if (usage) {
            this.logTokenUsage(usage);
        }
    }
    /** Log cumulative token usage after an iteration. */
    logTokenUsage(usage) {
        const state = this.orchestratorState;
        const message = this.t("driver.loop.iterationTokens", {
            inputTokens: String(usage.inputTokens),
            outputTokens: String(usage.outputTokens),
            cacheReadTokens: String(usage.cacheReadTokens),
            cacheCreationTokens: String(usage.cacheCreationTokens),
            totalInputTokens: String(state.totalInputTokens),
            totalOutputTokens: String(state.totalOutputTokens),
        });
        this.logger.log(createLogEntry("token_usage", "info", message, {
            runId: this.config.runId,
            iteration: state.currentIteration,
        }, {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalInputTokens: state.totalInputTokens,
            totalOutputTokens: state.totalOutputTokens,
        }));
    }
    // -------------------------------------------------------------------------
    // Private: effect execution
    // -------------------------------------------------------------------------
    /** Execute an array of effects via the effect executor. */
    async executeEffects(effects) {
        const signal = this.currentAbortController?.signal;
        try {
            await this.effectExecutor.executeEffects(effects, signal);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.log(createLogEntry("effect_execution_failed", "error", this.t("driver.loop.effectExecutionFailed", { message }), {
                runId: this.config.runId,
            }));
            throw error;
        }
    }
    // -------------------------------------------------------------------------
    // Private: skill-aware commit strategy (Req 7.1–7.7)
    // -------------------------------------------------------------------------
    /**
     * Build a phase-specific commit message for a completed SKILL phase.
     *
     * Commit message format per phase:
     * - **build**: uses the agent summary (plan-defined message proxy)
     * - **plan**: `forge(plan): <topic> plan approved`
     * - **fix** / **fix-apply**: `forge(fix): resolve P0/P1 from review`
     * - **refactor-apply**: `forge(refactor): apply refactoring changes`
     *
     * Falls back to a generic format for any other commitable phase.
     *
     * @param phase - The SKILL phase that completed.
     * @param iterationNumber - The current iteration number.
     * @param summary - The agent's iteration summary (used for build phase).
     * @returns The commit message string.
     */
    buildCommitMessageForPhase(phase, iterationNumber, summary) {
        switch (phase) {
            case "build":
                // Use agent summary as proxy for plan-defined commit message (Req 7.1).
                return `forge(build): ${summary}`;
            case "plan":
                return `forge(plan): ${this.config.objective} plan approved`;
            case "fix":
            case "fix-apply":
                return "forge(fix): resolve P0/P1 from review";
            case "refactor-apply":
                return "forge(refactor): apply refactoring changes";
            default:
                return `forge(${phase}): iteration ${iterationNumber} — ${summary}`;
        }
    }
    /**
     * Apply skill-aware commit strategy to the effects produced by the
     * orchestrator's state transition.
     *
     * The orchestrator always produces a `commit` effect on `iteration_success`
     * and a `rollback` effect on failures. In skill-aware mode, we refine this:
     *
     * - If `shouldCommitForPhase(phase, success)` returns `true`:
     *   Replace the generic commit message with a phase-specific one.
     * - If `shouldCommitForPhase(phase, success)` returns `false` and the
     *   iteration succeeded: Remove the `commit` effect (non-commitable phases
     *   like review/test don't produce code changes) and decrement commitCount.
     * - If the iteration failed: The orchestrator already produces `rollback`,
     *   which is correct for commitable phases. For non-commitable phases,
     *   rollback is harmless (no-op on clean tree).
     *
     * @param effects - The effects array from the orchestrator transition.
     * @param phase - The completed SKILL phase.
     * @param success - Whether the iteration succeeded.
     * @param iterationNumber - The current iteration number.
     * @param summary - The agent's iteration summary.
     * @returns The modified effects array.
     */
    applySkillAwareCommitStrategy(effects, phase, success, iterationNumber, summary) {
        if (shouldCommitForPhase(phase, success)) {
            // Replace the generic commit message with a phase-specific one (Req 7.1–7.3).
            const commitMessage = this.buildCommitMessageForPhase(phase, iterationNumber, summary);
            return effects.map((e) => e.type === "commit" ? { type: "commit", message: commitMessage } : e);
        }
        if (success && !shouldCommitForPhase(phase, success)) {
            // Non-commitable phase succeeded — remove the commit effect (Req 7.4).
            // Also adjust commitCount since the orchestrator incremented it.
            const filtered = effects.filter((e) => e.type !== "commit");
            if (filtered.length !== effects.length) {
                // A commit effect was removed — decrement the commitCount that the
                // orchestrator optimistically incremented.
                this.orchestratorState = {
                    ...this.orchestratorState,
                    commitCount: Math.max(0, this.orchestratorState.commitCount - 1),
                };
            }
            return filtered;
        }
        // Failed iteration with non-commitable phase — rollback is already in effects
        // from the orchestrator (harmless no-op on clean tree). No changes needed.
        return effects;
    }
    // -------------------------------------------------------------------------
    // Private: result construction
    // -------------------------------------------------------------------------
    /** Build the final driver result. */
    buildResult() {
        return {
            finalState: this.orchestratorState,
            notesDocument: this.notesDocument,
            commitCount: this.orchestratorState.commitCount,
        };
    }
}
// ---------------------------------------------------------------------------
// Skill-aware mode detection
// ---------------------------------------------------------------------------
/**
 * Detect whether Skill-aware mode should be enabled by checking if the
 * `.forge/` directory exists in the given working directory.
 *
 * @param cwd - The working directory (repository root) to check.
 * @returns `true` if `.forge/` directory exists, `false` otherwise.
 */
export function detectSkillAwareMode(cwd) {
    try {
        return existsSync(join(cwd, ".forge"));
    }
    catch (err) {
        console.error(`[debug] detectSkillAwareMode failed for "${cwd}": ${err instanceof Error ? err.message : String(err)}`);
        return false;
    }
}
//# sourceMappingURL=sdk-driver.js.map