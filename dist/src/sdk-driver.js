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
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { appendEntry, buildIterationPrompt, buildSkillAwarePrompt, formatNotesDocument, } from "./context-accumulator.js";
import { createInitialState, transition } from "./orchestrator.js";
import { advanceMethodology, buildPressurePrompt, detectFailurePattern, determinePressureLevel, getMethodologyChain, getStallResponse, selectMethodology, } from "./pua-engine.js";
import { RunManager } from "./run-manager.js";
import { determineNextSkill } from "./skill-scheduler.js";
import { clearLoopFields, clearPuaFields, extractLoopFields, extractPuaFields, updateIterationStatus, writePuaFields, } from "./status-file-ext.js";
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
    /** Counter for consecutive review-fix loop iterations (skill-aware mode). */
    reviewFixAttempts = 0;
    // PUA engine state (only used when puaEnabled is true)
    /** Most recent iteration summaries (kept to last 5). */
    summaryHistory = [];
    /** Current position in the methodology switch chain. */
    puaMethodologyChainIndex = 0;
    /** Current methodology switch chain (set when a failure pattern is first detected). */
    currentMethodologyChain = null;
    constructor(config, effectExecutor, agentAdapter) {
        // Validate objective is non-empty after trimming.
        if (!config.objective.trim()) {
            throw new Error("Objective must be a non-empty string");
        }
        // Default skillAware to false if not provided.
        this.config = { ...config, skillAware: config.skillAware ?? false };
        this.effectExecutor = effectExecutor;
        this.agentAdapter = agentAdapter;
        // Initialize orchestrator state.
        this.orchestratorState = createInitialState();
        // Initialize empty notes document.
        this.notesDocument = { runId: config.runId, branchName: config.branchName, entries: [] };
        this.notesContent = formatNotesDocument(this.notesDocument);
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
                console.warn(`hooks protection missing: ${hooksResult.reason}`);
            }
        }
        catch (err) {
            console.warn(`hooks protection missing: unexpected error during hooks validation — ${err instanceof Error ? err.message : String(err)}`);
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
            // Skill-aware cleanup: clear Loop fields from StatusFile when loop ends.
            if (this.config.skillAware) {
                try {
                    this.clearStatusFileLoopFields();
                }
                catch (err) {
                    console.warn(`Warning: failed to clear StatusFile loop fields: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
            // PUA cleanup: clear PUA fields from StatusFile when loop ends.
            if (this.config.puaEnabled) {
                try {
                    this.safeClearPuaFields();
                }
                catch (err) {
                    console.warn(`Warning: failed to clear PUA fields on loop end: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
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
        void this.executeEffects(result.effects);
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
        try {
            // Invoke the agent adapter.
            const agentResult = await this.agentAdapter.run(prompt, this.config.cwd, {
                signal: this.currentAbortController.signal,
            });
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
            const zeroUsage = {
                inputTokens: 0,
                outputTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
            };
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
            // Revert to pre-transition state so that commitCount is not incremented.
            this.orchestratorState = preTransitionState;
            // Dispatch iteration_hard_failure from the original state — this triggers
            // rollback and does NOT increment commitCount.
            const zeroUsage = {
                inputTokens: 0,
                outputTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
            };
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
        const puaEnabled = this.config.puaEnabled === true;
        // Read current StatusFile to determine next skill phase.
        const statusContent = this.readStatusFileContent();
        const loopFields = extractLoopFields(statusContent);
        // --- PUA: Before iteration — restore state from StatusFile ---
        let puaContext;
        if (puaEnabled) {
            try {
                const puaFields = extractPuaFields(statusContent);
                // Restore methodology chain state from persisted fields
                if (puaFields.puaChainIndex !== undefined) {
                    this.puaMethodologyChainIndex = puaFields.puaChainIndex;
                }
                if (puaFields.puaFailurePattern !== undefined && this.currentMethodologyChain === null) {
                    try {
                        this.currentMethodologyChain = getMethodologyChain(puaFields.puaFailurePattern);
                    }
                    catch {
                        // Invalid failure pattern — ignore
                    }
                }
                // Build PUA context if we have persisted pressure state
                if (puaFields.puaPressureLevel !== undefined) {
                    const methodology = puaFields.puaMethodology ?? null;
                    const failurePattern = puaFields.puaFailurePattern ?? null;
                    const consecutiveFailures = this.orchestratorState.consecutiveFailures;
                    const stallResponse = consecutiveFailures > 0 ? getStallResponse(consecutiveFailures) : null;
                    const pressurePrompt = buildPressurePrompt(puaFields.puaPressureLevel, methodology, failurePattern, stallResponse);
                    puaContext = {
                        pressureLevel: puaFields.puaPressureLevel,
                        methodology,
                        failurePattern,
                        stallResponse,
                        pressurePrompt,
                    };
                }
            }
            catch (err) {
                // PUA engine error — degrade gracefully, continue without PUA
                console.warn(`Warning: PUA state restoration failed, continuing without PUA: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
                puaContext = undefined;
            }
        }
        const schedulerResult = determineNextSkill({
            currentPhase: loopFields.mode
                ? (this.getPhaseFromStatusContent(statusContent) ?? undefined)
                : undefined,
            tier: this.config.presetTier ?? this.getTierFromStatusContent(statusContent),
            planStatus: undefined, // Plan status is determined by the agent
            hasIncompleteTasks: undefined,
            reviewResult: undefined,
            testPassed: undefined,
            reviewFixAttempts: this.reviewFixAttempts,
            maxReviewFixAttempts: this.config.loopConfig.maxConsecutiveFailures,
        });
        // If the scheduler says completed or aborted, signal the agent.
        const nextPhase = schedulerResult.nextPhase;
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
        try {
            // Invoke the agent adapter.
            const agentResult = await this.agentAdapter.run(prompt, this.config.cwd, {
                signal: this.currentAbortController.signal,
            });
            const output = agentResult.output;
            const usage = agentResult.usage;
            // Update reviewFixAttempts based on gate_result.
            if (output.gate_result === "passed") {
                this.reviewFixAttempts = 0;
            }
            else if (output.gate_result === "blocked") {
                this.reviewFixAttempts++;
            }
            if (output.should_fully_stop) {
                // Stop condition met — dispatch stop_condition_met event.
                const stopResult = transition(this.orchestratorState, { type: "stop_condition_met" }, this.config.limits);
                this.orchestratorState = stopResult.state;
                this.lastEffects = stopResult.effects;
                await this.executeEffects(stopResult.effects);
                // Still record the iteration entry.
                iterationEntry = this.buildIterationEntry(iterationNumber, true, output);
                this.appendAndPersistNotes(iterationEntry, usage);
                // PUA: success path — clear state on stop
                if (puaEnabled) {
                    this.handlePuaSuccess();
                }
                // Update StatusFile (non-critical).
                this.safeUpdateIterationStatus(nextPhase, iterationNumber);
                return;
            }
            if (output.success) {
                event = {
                    type: "iteration_success",
                    summary: output.summary,
                    tokenUsage: usage,
                };
                iterationEntry = this.buildIterationEntry(iterationNumber, true, output);
                iterationSuccess = true;
                iterationSummary = output.summary;
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
            const zeroUsage = {
                inputTokens: 0,
                outputTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
            };
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
        }
        finally {
            this.currentAbortController = null;
        }
        // Dispatch the event to the state machine.
        const result = transition(this.orchestratorState, event, this.config.limits);
        // Save pre-transition state in case effect execution fails.
        const preTransitionState = this.orchestratorState;
        this.orchestratorState = result.state;
        this.lastEffects = result.effects;
        // Execute the resulting effects.
        // If effect execution fails (e.g., commit throws), revert to pre-transition
        // state and dispatch iteration_hard_failure instead.
        try {
            await this.executeEffects(result.effects);
        }
        catch (effectError) {
            const effectMessage = effectError instanceof Error ? effectError.message : String(effectError);
            // Revert to pre-transition state so that commitCount is not incremented.
            this.orchestratorState = preTransitionState;
            // Dispatch iteration_hard_failure from the original state.
            const zeroUsage = {
                inputTokens: 0,
                outputTokens: 0,
                cacheReadTokens: 0,
                cacheCreationTokens: 0,
            };
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
                this.handlePuaFailure(`Effect execution failed: ${effectMessage}`);
            }
            // Update StatusFile with current phase and iteration (non-critical).
            this.safeUpdateIterationStatus(nextPhase, iterationNumber);
            return;
        }
        // Append iteration entry to notes and persist.
        this.appendAndPersistNotes(iterationEntry, "tokenUsage" in event ? event.tokenUsage : undefined);
        // --- PUA: After iteration — handle success/failure paths ---
        if (puaEnabled) {
            if (iterationSuccess) {
                this.handlePuaSuccess();
            }
            else {
                this.handlePuaFailure(iterationSummary);
            }
        }
        // Update StatusFile with current phase and iteration (non-critical).
        this.safeUpdateIterationStatus(nextPhase, iterationNumber);
    }
    // -------------------------------------------------------------------------
    // Private: PUA engine helpers
    // -------------------------------------------------------------------------
    /**
     * Handle PUA state after a successful iteration.
     *
     * Clears summary history, resets methodology chain index, and removes
     * PUA fields from StatusFile.
     */
    handlePuaSuccess() {
        try {
            this.summaryHistory = [];
            this.puaMethodologyChainIndex = 0;
            this.currentMethodologyChain = null;
            this.safeClearPuaFields();
        }
        catch (err) {
            console.warn(`Warning: PUA success cleanup failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
        }
    }
    /**
     * Handle PUA state after a failed iteration.
     *
     * Pushes summary to history (keeping last 5), detects failure pattern,
     * determines pressure level, selects/advances methodology, builds
     * pressure prompt, and persists PUA state to StatusFile.
     */
    handlePuaFailure(summary) {
        try {
            // Push summary to history (keep last 5)
            this.summaryHistory.push(summary);
            if (this.summaryHistory.length > 5) {
                this.summaryHistory = this.summaryHistory.slice(-5);
            }
            // Detect failure pattern
            const failurePattern = detectFailurePattern(this.summaryHistory);
            // Determine pressure level
            const consecutiveFailures = this.orchestratorState.consecutiveFailures;
            const hasStall = failurePattern === "spinning";
            const pressureLevel = determinePressureLevel(consecutiveFailures, hasStall);
            // Methodology selection/advancement
            let methodology = null;
            if (pressureLevel !== "L0") {
                if (failurePattern !== null) {
                    if (this.currentMethodologyChain === null) {
                        // First time detecting this failure pattern — get the chain
                        this.currentMethodologyChain = getMethodologyChain(failurePattern);
                        this.puaMethodologyChainIndex = 0;
                        methodology = this.currentMethodologyChain[0] ?? null;
                    }
                    else {
                        // Advance in the existing chain
                        const next = advanceMethodology(this.currentMethodologyChain, this.puaMethodologyChainIndex);
                        if (next !== null) {
                            this.puaMethodologyChainIndex++;
                            methodology = next;
                        }
                        else {
                            // Chain exhausted — don't block Orchestrator's normal circuit-breaking
                            methodology = null;
                        }
                    }
                }
                else {
                    // No failure pattern detected — use task-type-based methodology
                    methodology = selectMethodology(this.config.puaTaskType ?? "general");
                }
            }
            // Build pressure prompt — return value intentionally discarded.
            // PUA state (pressureLevel, methodology, failurePattern) is persisted to
            // StatusFile via safeWritePuaFields below. On the next iteration,
            // executeSkillAwareIteration restores puaContext from StatusFile and
            // calls buildPressurePrompt there to produce the prompt string.
            // @see executeSkillAwareIteration — "PUA: Before iteration — restore state from StatusFile"
            const stallResponse = getStallResponse(consecutiveFailures);
            buildPressurePrompt(pressureLevel, methodology, failurePattern, stallResponse);
            // Persist PUA state to StatusFile
            this.safeWritePuaFields({
                puaPressureLevel: pressureLevel,
                puaMethodology: methodology ?? undefined,
                puaChainIndex: this.puaMethodologyChainIndex,
                puaFailurePattern: failurePattern ?? undefined,
            });
        }
        catch (err) {
            // PUA engine error — degrade gracefully, continue without PUA
            console.warn(`Warning: PUA failure handling failed, continuing without PUA: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
        }
    }
    /**
     * Safely write PUA fields to StatusFile.
     * Wraps in try/catch and logs warning on failure.
     */
    safeWritePuaFields(fields) {
        try {
            const currentContent = this.readStatusFileContent();
            const updatedContent = writePuaFields(currentContent, fields);
            this.writeStatusFileContent(updatedContent);
        }
        catch (err) {
            console.warn(`Warning: failed to write PUA fields to StatusFile: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
        }
    }
    /**
     * Safely clear PUA fields from StatusFile.
     * Wraps in try/catch and logs warning on failure.
     */
    safeClearPuaFields() {
        try {
            const currentContent = this.readStatusFileContent();
            const clearedContent = clearPuaFields(currentContent);
            this.writeStatusFileContent(clearedContent);
        }
        catch (err) {
            console.warn(`Warning: failed to clear PUA fields from StatusFile: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
        }
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
        const message = `Iteration tokens — input: ${usage.inputTokens}, output: ${usage.outputTokens}, ` +
            `cache read: ${usage.cacheReadTokens}, cache creation: ${usage.cacheCreationTokens} | ` +
            `Cumulative — input: ${state.totalInputTokens}, output: ${state.totalOutputTokens}`;
        console.log(message);
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
            console.log(`Effect execution failed: ${message}`);
            throw error;
        }
    }
    // -------------------------------------------------------------------------
    // Private: StatusFile helpers (skill-aware mode)
    // -------------------------------------------------------------------------
    /**
     * Read StatusFile content via the configured callback.
     * Returns empty string if no callback is configured or if reading fails.
     */
    readStatusFileContent() {
        if (!this.config.readStatusFile)
            return "";
        try {
            return this.config.readStatusFile();
        }
        catch {
            return "";
        }
    }
    /**
     * Write StatusFile content via the configured callback.
     * Silently ignores failures (StatusFile updates are non-critical).
     */
    writeStatusFileContent(content) {
        if (!this.config.writeStatusFile)
            return;
        this.config.writeStatusFile(content);
    }
    /**
     * Extract the `phase` field from StatusFile content.
     * Returns null if not found.
     */
    getPhaseFromStatusContent(content) {
        const match = content.match(/^phase:\s*"?([^"\n]*)"?\s*$/m);
        return match ? match[1].trim() : null;
    }
    /**
     * Extract the `tier` field from StatusFile content.
     * Returns undefined if not found.
     */
    getTierFromStatusContent(content) {
        const match = content.match(/^tier:\s*"?([^"\n]*)"?\s*$/m);
        return match ? match[1].trim() : undefined;
    }
    /**
     * Safely update StatusFile with current phase and iteration.
     * Wraps in try/catch and logs warning on failure (Req 6.7).
     */
    safeUpdateIterationStatus(phase, iteration) {
        try {
            const currentContent = this.readStatusFileContent();
            const updatedContent = updateIterationStatus(currentContent, phase, iteration);
            this.writeStatusFileContent(updatedContent);
        }
        catch (err) {
            console.warn(`Warning: failed to update StatusFile iteration status: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    /**
     * Clear all Loop-related fields from StatusFile.
     * Called when the loop ends.
     */
    clearStatusFileLoopFields() {
        const currentContent = this.readStatusFileContent();
        const clearedContent = clearLoopFields(currentContent);
        this.writeStatusFileContent(clearedContent);
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
    catch {
        return false;
    }
}
//# sourceMappingURL=sdk-driver.js.map