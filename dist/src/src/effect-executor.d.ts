/**
 * Effect executor — interprets `OrchestratorEffect` descriptors and performs
 * real-world I/O (git commands, backoff sleep, abort/stop signalling).
 *
 * The executor is stateless with respect to business logic. All decision-making
 * lives in the pure-function orchestrator; this module only carries out the
 * instructions encoded in effect descriptors.
 *
 * Design reference: sdk-autonomous-loop § effect-executor.ts
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 */
import { ForgeError } from "./forge-error.js";
import type { OrchestratorEffect } from "./loop-types.js";
/**
 * Thrown when the inner-layer frozen zone check detects that staged files
 * include locked/approved `.forge/` files. This is a deliberate policy
 * violation — the loop should terminate immediately without triggering
 * exponential backoff.
 *
 * **Validates: Requirements 8.1, 8.2**
 */
export declare class FrozenZoneViolation extends ForgeError {
    readonly code: "FROZEN_ZONE_VIOLATION";
    readonly files: string[];
    constructor(files: string[]);
}
/**
 * Thrown when an effect execution fails for an unexpected reason (e.g. git
 * command crash, I/O error). The loop should treat this as a hard failure
 * and trigger `iteration_hard_failure` with exponential backoff.
 *
 * **Validates: Requirements 8.1, 8.3**
 */
export declare class UnexpectedEffectError extends ForgeError {
    readonly code: "UNEXPECTED_EFFECT_ERROR";
}
/**
 * Dependencies injected into the effect executor.
 *
 * Keeps the executor decoupled from concrete I/O implementations, making
 * it straightforward to test with stubs.
 */
export interface EffectExecutorDeps {
    /** Working directory for git commands. */
    cwd: string;
    /** Callback to persist notes content after updates. */
    onNotesUpdate: (content: string) => void;
    /** Callback for logging messages. */
    onLog: (message: string) => void;
    /** When true, rollback logs what would be cleaned without executing destructive operations. */
    dryRun?: boolean;
}
/**
 * Public interface for the effect executor.
 *
 * Consumers (e.g. `SdkDriver`) depend on this interface rather than the
 * concrete `EffectExecutor` class, enabling type-safe test doubles that
 * produce compile-time errors when the real interface changes.
 */
export interface EffectExecutorInterface {
    /** Set to `true` when an `abort` effect is executed. */
    aborted: boolean;
    /** Set to `true` when a `stop` effect is executed. */
    stopped: boolean;
    /**
     * Execute a single effect descriptor.
     *
     * @param effect      The effect descriptor to execute.
     * @param abortSignal Optional signal to interrupt long-running effects.
     */
    executeEffect(effect: OrchestratorEffect, abortSignal?: AbortSignal): Promise<void>;
    /**
     * Execute an ordered list of effects sequentially.
     *
     * @param effects     Array of effect descriptors to execute in order.
     * @param abortSignal Optional signal to interrupt long-running effects.
     */
    executeEffects(effects: OrchestratorEffect[], abortSignal?: AbortSignal): Promise<void>;
}
/**
 * Interprets `OrchestratorEffect` descriptors and performs real-world I/O.
 *
 * The driver reads the `aborted` and `stopped` flags after executing effects
 * to decide whether to continue the loop.
 */
export declare class EffectExecutor implements EffectExecutorInterface {
    /** Set to `true` when an `abort` effect is executed. */
    aborted: boolean;
    /** Set to `true` when a `stop` effect is executed. */
    stopped: boolean;
    private readonly deps;
    constructor(deps: EffectExecutorDeps);
    /**
     * Execute a single effect descriptor.
     *
     * Dispatches on `effect.type` and performs the corresponding I/O action.
     * Returns a promise that resolves when the effect is complete.
     *
     * @param effect      The effect descriptor to execute.
     * @param abortSignal Optional signal to interrupt long-running effects (backoff).
     */
    executeEffect(effect: OrchestratorEffect, abortSignal?: AbortSignal): Promise<void>;
    /**
     * Execute an ordered list of effects sequentially.
     *
     * Effects are processed in the exact order they appear in the array.
     * No effect is executed before all preceding effects have completed.
     * If the abort signal fires, remaining effects are skipped and an
     * interruption message is logged.
     *
     * @param effects     Array of effect descriptors to execute in order.
     * @param abortSignal Optional signal to interrupt long-running effects.
     */
    executeEffects(effects: OrchestratorEffect[], abortSignal?: AbortSignal): Promise<void>;
    /**
     * Execute a commit: `git add -A` followed by `git commit -m <message>`.
     *
     * Before committing, performs an inner-layer frozen zone check on staged
     * files. If any frozen file has been modified, the commit is aborted and
     * a rollback is performed instead. This provides defense-in-depth beyond
     * the outer Hook layer.
     *
     * If the abort signal has fired, the commit is skipped entirely and an
     * interruption message is logged.
     *
     * Uses `execFileSync` with argv arrays (no shell) to prevent injection.
     */
    private executeCommit;
    /**
     * Check staged files for frozen zone violations.
     *
     * Scans `git diff --cached --name-only` for files under `.forge/` that
     * are in the frozen zone with a locked/approved status. Returns the list
     * of violating file paths.
     *
     * This is the inner-layer defense — even if the Hook layer fails to
     * intercept a write, this check prevents frozen files from being committed.
     */
    private checkStagedFrozenFiles;
    /**
     * Execute a rollback: `git reset --hard HEAD` followed by `git clean -fd`.
     *
     * Before the destructive reset, attempts to stash uncommitted changes as a
     * safety net. If the stash fails (e.g. clean working tree), the rollback
     * proceeds normally.
     *
     * If the abort signal has fired, the rollback is skipped entirely and an
     * interruption message is logged.
     *
     * Uses `execFileSync` with argv arrays (no shell) to prevent injection.
     */
    private executeRollback;
    /**
     * Execute an interruptible backoff sleep.
     *
     * Creates a promise that resolves when either:
     * 1. The specified duration elapses (via `setTimeout`), or
     * 2. The abort signal fires (early resolution for clean cancellation).
     *
     * @param durationMs  How long to sleep in milliseconds.
     * @param abortSignal Optional signal to interrupt the sleep early.
     */
    private executeBackoff;
    /**
     * Execute a Ship merge: checkout target → merge --no-ff feature → delete feature branch.
     *
     * On merge failure, executes `merge --abort` to restore clean state
     * and throws without deleting the feature branch.
     */
    private executeShipMerge;
    /**
     * Execute a Ship push + PR: push to remote with upstream, then create PR via gh CLI.
     *
     * Push failure throws immediately. PR creation failure logs a warning
     * but does NOT throw — the push result is preserved.
     */
    private executeShipPushPr;
    /**
     * Execute a Ship discard: checkout main → force delete feature branch.
     */
    private executeShipDiscard;
    /**
     * Execute a `write_event_log` effect by appending a JSONL line to the
     * run's `events.jsonl` file.
     *
     * Behaviour:
     *   - Ensures `.forge/runs/<runId>/` exists before writing.
     *   - Appends `JSON.stringify(entry) + "\n"` to `events.jsonl`.
     *   - Failures are logged via `onLog` and swallowed — the event log is
     *     an audit artefact, and a write failure must NOT cause the
     *     surrounding iteration to rollback or abort (Requirement 3.6).
     *
     * **Validates: Requirements 3.1, 3.6**
     */
    private executeWriteEventLog;
}
