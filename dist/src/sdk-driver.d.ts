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
import type { EffectExecutorInterface } from "./effect-executor.js";
import type { AgentInterface, LoopConfig, NotesDocument, OrchestratorState, RunLimits } from "./loop-types.js";
import type { TaskType } from "./pua-engine.js";
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
    /** Most recent iteration summaries (kept to last 5). */
    private summaryHistory;
    /** Current position in the methodology switch chain. */
    private puaMethodologyChainIndex;
    /** Current methodology switch chain (set when a failure pattern is first detected). */
    private currentMethodologyChain;
    constructor(config: SdkDriverConfig, effectExecutor: EffectExecutorInterface, agentAdapter: AgentInterface);
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
     * Handle PUA state after a successful iteration.
     *
     * Clears summary history, resets methodology chain index, and removes
     * PUA fields from StatusFile.
     */
    private handlePuaSuccess;
    /**
     * Handle PUA state after a failed iteration.
     *
     * Pushes summary to history (keeping last 5), detects failure pattern,
     * determines pressure level, selects/advances methodology, builds
     * pressure prompt, and persists PUA state to StatusFile.
     */
    private handlePuaFailure;
    /**
     * Safely write PUA fields to StatusFile.
     * Wraps in try/catch and logs warning on failure.
     */
    private safeWritePuaFields;
    /**
     * Safely clear PUA fields from StatusFile.
     * Wraps in try/catch and logs warning on failure.
     */
    private safeClearPuaFields;
    /** Build an `IterationEntry` from an iteration result. */
    private buildIterationEntry;
    /** Append an iteration entry to the notes document and persist to disk. */
    private appendAndPersistNotes;
    /** Log cumulative token usage after an iteration. */
    private logTokenUsage;
    /** Execute an array of effects via the effect executor. */
    private executeEffects;
    /**
     * Read StatusFile content via the configured callback.
     * Returns empty string if no callback is configured or if reading fails.
     */
    private readStatusFileContent;
    /**
     * Write StatusFile content via the configured callback.
     * Silently ignores failures (StatusFile updates are non-critical).
     */
    private writeStatusFileContent;
    /**
     * Extract the `phase` field from StatusFile content.
     * Returns null if not found.
     */
    private getPhaseFromStatusContent;
    /**
     * Extract the `tier` field from StatusFile content.
     * Returns undefined if not found.
     */
    private getTierFromStatusContent;
    /**
     * Safely update StatusFile with current phase and iteration.
     * Wraps in try/catch and logs warning on failure (Req 6.7).
     */
    private safeUpdateIterationStatus;
    /**
     * Clear all Loop-related fields from StatusFile.
     * Called when the loop ends.
     */
    private clearStatusFileLoopFields;
    /** Build the final driver result. */
    private buildResult;
}
/**
 * Detect whether Skill-aware mode should be enabled by checking if the
 * `.forge/` directory exists in the given working directory.
 *
 * @param cwd - The working directory (repository root) to check.
 * @returns `true` if `.forge/` directory exists, `false` otherwise.
 */
export declare function detectSkillAwareMode(cwd: string): boolean;
