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
import { type EffectExecutorInterface } from "./effect-executor.js";
import { type LogSinkConfig, type PerformanceBaseline } from "./logger/index.js";
import type { AgentInterface, LoopConfig, NotesDocument, OrchestratorState, RunLimits } from "./loop-types.js";
import type { TaskType } from "./pua-engine.js";
import { type TranslateFn } from "./run-manager.js";
/**
 * Configuration for the SDK driver instance.
 *
 * The `warmQuery` field is typed as `unknown` to avoid importing Agent SDK
 * types directly — the driver never touches it; it's passed through to the
 * agent adapter.
 */
export interface SdkDriverConfig {
    /** The user-provided objective for the autonomous loop. */
    objective: string;
    /** Loop configuration (agent, failure thresholds, etc.). */
    loopConfig: LoopConfig;
    /** User-specified resource limits. */
    limits: RunLimits;
    /** Working directory (repository root). */
    cwd: string;
    /** Unique identifier for this run. */
    runId: string;
    /** Path to the run directory. */
    runDir: string;
    /** Pre-warmed Agent SDK query handle. */
    warmQuery: unknown;
    /** Base commit SHA for branch commit counting. */
    baseCommit: string;
    /** Path to the notes.md file for persistence. */
    notesPath: string;
    /** ★ Preset routing tier (from --tier). */
    presetTier?: string;
    /** ★ Preset task type (from --type). */
    presetTaskType?: string;
    /** ★ Preset project phase (from --phase). */
    presetProjectPhase?: string;
    /** ★ Preset work nature (from --nature). */
    presetWorkNature?: string;
    /** ★ Whether to enable Skill-aware mode. Defaults to false. */
    skillAware: boolean;
    /** Git branch name for this run (used to initialize notes metadata). */
    branchName: string;
    /** ★ Whether to enable PUA Quality Engine. Defaults to false. */
    puaEnabled?: boolean;
    /** ★ Preset task type for PUA methodology routing (from --pua-task-type). */
    puaTaskType?: TaskType;
    /** Optional callback to read StatusFile content (for skill-aware mode). */
    readStatusFile?: () => string;
    /** Optional callback to write StatusFile content (for skill-aware mode). */
    writeStatusFile?: (content: string) => void;
    /** Optional callback to read review report content (for quality gate evaluation). */
    readReviewFile?: () => string;
    /** Optional callback to read test result content (for quality gate evaluation). */
    readTestFile?: () => string;
    /** Optional callback to read progress content (for quality gate evaluation). */
    readProgressFile?: () => string;
    /** Optional translation function for i18n support. When not provided, English strings are used. */
    t?: TranslateFn;
    /** Log sink configuration for structured logging. When not provided, defaults to text/info. */
    logSinkConfig?: LogSinkConfig;
    /** Whether to enable sandbox mode with fine-grained access control. */
    sandboxEnabled?: boolean;
}
/** Result returned when the driver loop exits. */
export interface SdkDriverResult {
    /** The final orchestrator state at loop exit. */
    finalState: OrchestratorState;
    /** The accumulated notes document. */
    notesDocument: NotesDocument;
    /** Number of successful commits made during the run. */
    commitCount: number;
}
/**
 * Validate that the hooks configuration file exists and contains a
 * `PreToolUse` section. This is a pure-function check used at startup
 * to warn when the outer protection layer (hooks) is missing.
 *
 * @param cwd - The working directory (repository root) to check.
 * @returns An object with `valid: true` if hooks are present, or
 *   `valid: false` with a `reason` string explaining the issue.
 */
export declare function validateHooksPresence(cwd: string): {
    valid: boolean;
    reason?: string;
};
/**
 * Core autonomous loop driver.
 *
 * Bridges the pure-function state machine (`orchestrator.ts`) with real I/O
 * via the effect executor and agent adapter. Owns the main `while` loop,
 * orchestrator state, and notes document.
 */
export declare class SdkDriver {
    private readonly config;
    private readonly effectExecutor;
    private readonly agentAdapter;
    private orchestratorState;
    private notesDocument;
    private notesContent;
    /** The most recent set of effects from the last transition. */
    private lastEffects;
    /** AbortController for the current iteration's agent invocation. */
    private currentAbortController;
    /** Flag indicating requestStop() has been called. */
    private stopRequested;
    /** Counter for consecutive review-fix loop iterations (skill-aware mode). */
    private reviewFixAttempts;
    /** Tracks whether the loop completed normally (SkillScheduler returned "completed"). */
    private loopCompletedNormally;
    /** PUA state manager (only instantiated when puaEnabled is true). */
    private readonly puaStateManager;
    /** StatusFile I/O interface for delegating to helper functions. */
    private readonly statusFileIO;
    /** Structured logger for observability. */
    private readonly logger;
    /** Iteration timing accumulator for performance baseline. */
    private readonly iterationTimings;
    /** Subagent timing accumulator for extended performance baseline. */
    private readonly subagentTimings;
    /** Counter for degradation alerts triggered during the run. */
    private degradationCount;
    /** Previous SKILL phase name for detecting phase transitions. */
    private previousPhase;
    constructor(config: SdkDriverConfig, effectExecutor: EffectExecutorInterface, agentAdapter: AgentInterface);
    /**
     * Internal translation helper. Falls back to the key-based default
     * when no translation function is configured.
     */
    private t;
    /**
     * Run the autonomous loop until a termination condition is met.
     *
     * The loop continues while the orchestrator state is `running` or `waiting`.
     * It exits when the state transitions to `aborted` or `stopped`, or when
     * the effect executor sets its `aborted` or `stopped` flags.
     *
     * @returns The final driver result with state, notes, and commit count.
     */
    run(): Promise<SdkDriverResult>;
    /**
     * Signal the driver to stop gracefully.
     *
     * Dispatches a `user_interrupt` event to the state machine, executes
     * the resulting effects, and aborts the current agent invocation.
     */
    requestStop(): void;
    /** Check if the loop should continue running. */
    private isLoopActive;
    /** Check if a specific effect type exists in an effects array. */
    private hasEffect;
    /**
     * Execute a single iteration: build prompt → invoke agent → process result.
     *
     * When `skillAware` is true, delegates to `executeSkillAwareIteration()`.
     * Otherwise, uses the original generic iteration logic.
     */
    private executeIteration;
    /**
     * Original generic iteration logic (non-skill-aware).
     */
    private executeGenericIteration;
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
    private executeSkillAwareIteration;
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
    private evaluateQualityGateForPhase;
    /**
     * Read file content via a configured callback.
     * Returns null if no callback is configured or if reading fails.
     *
     * @param reader - The configured file reader callback, or undefined.
     * @returns File content string, or null.
     */
    private readFileContent;
    /**
     * Read review file content via the configured callback.
     * Returns null if no callback is configured or if reading fails.
     */
    private readReviewFileContent;
    /**
     * Read test result file content via the configured callback.
     * Returns null if no callback is configured or if reading fails.
     */
    private readTestFileContent;
    /**
     * Read progress file content via the configured callback.
     * Returns null if no callback is configured or if reading fails.
     */
    private readProgressFileContent;
    /** Build an `IterationEntry` from an iteration result. */
    private buildIterationEntry;
    /** Append an iteration entry to the notes document and persist to disk. */
    private appendAndPersistNotes;
    /** Log cumulative token usage after an iteration. */
    private logTokenUsage;
    /** Execute an array of effects via the effect executor. */
    private executeEffects;
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
    private buildCommitMessageForPhase;
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
    private applySkillAwareCommitStrategy;
    /** Build the final driver result. */
    private buildResult;
    /**
     * Format and output a structured completion or abort summary.
     *
     * Called at the end of `run()` before returning the result. Outputs
     * structured console output matching SKILL.md examples:
     *
     * - **Normal completion**: objective, tier, total iterations, per-phase
     *   pass/fail status, branch name.
     * - **Circuit breaker abort**: unresolved P0/P1 issues list and recovery
     *   suggestions.
     * - **Error abort**: error reason and `/forge resume` suggestion.
     *
     * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**
     */
    formatCompletionSummary(baseline: PerformanceBaseline): string;
    /**
     * Build per-phase pass/fail status from the notes document entries.
     *
     * Scans iteration entries for `skill_phase_completed` information
     * embedded in summaries, and aggregates pass/fail per phase.
     *
     * @returns Array of formatted phase status strings (e.g., "✅ build", "❌ review").
     */
    private buildPhaseStatusSummary;
    /**
     * Collect unresolved P0/P1 issues from the last review gate evaluation.
     *
     * Reads the review file content (if available) and extracts P0/P1 issues
     * from the quality gate evaluation.
     *
     * @returns Array of formatted issue strings.
     */
    private collectUnresolvedIssues;
    /**
     * Get the last failure reason from the notes document.
     *
     * @returns The summary of the last failed iteration, or null if none.
     */
    private getLastFailureReason;
}
/**
 * Detect whether Skill-aware mode should be enabled by checking if the
 * `.forge/` directory exists in the given working directory.
 *
 * @param cwd - The working directory (repository root) to check.
 * @returns `true` if `.forge/` directory exists, `false` otherwise.
 */
export declare function detectSkillAwareMode(cwd: string): boolean;
