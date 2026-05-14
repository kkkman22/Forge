/**
 * PUA State Manager — encapsulates PUA (Performance Under Accountability)
 * state management logic extracted from SdkDriver.
 *
 * Owns the mutable PUA state (summary history, methodology chain index,
 * current methodology chain) and provides methods for handling success/failure
 * paths, safe StatusFile persistence, and context restoration.
 *
 * Design reference: audit-remediation § design.md — Work Stream 5
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
 */
import type { PuaContext, TaskType } from "./pua-engine.js";
import type { PuaStatusFields } from "./status-file-ext.js";
/**
 * Dependencies injected into the PUA state manager.
 *
 * Keeps the manager decoupled from I/O — the caller provides callbacks
 * for StatusFile access and warning output.
 */
export interface PuaStateManagerDeps {
    /** Read the current StatusFile content. */
    readStatusFile: () => string;
    /** Write updated content to the StatusFile. */
    writeStatusFile: (content: string) => void;
    /** Emit a warning message (typically `console.warn`). */
    warn: (message: string) => void;
}
/**
 * Manages PUA engine state across iterations.
 *
 * Extracted from `SdkDriver` to reduce cognitive load and improve
 * testability. Maintains identical behavior to the original inline
 * implementation.
 */
export declare class PuaStateManager {
    private readonly deps;
    private readonly taskType;
    /** Most recent iteration summaries (kept to last {@link MAX_SUMMARY_HISTORY}). */
    private summaryHistory;
    /** Current position in the methodology switch chain. */
    private methodologyChainIndex;
    /** Current methodology switch chain (set when a failure pattern is first detected). */
    private currentMethodologyChain;
    /**
     * @param deps - I/O callbacks for StatusFile access and warning output.
     * @param taskType - Task type for methodology routing when no failure pattern is detected.
     */
    constructor(deps: PuaStateManagerDeps, taskType?: TaskType | string);
    /**
     * Handle PUA state after a successful iteration.
     *
     * Clears summary history, resets methodology chain index, and removes
     * PUA fields from StatusFile.
     */
    handleSuccess(): void;
    /**
     * Handle PUA state after a failed iteration.
     *
     * Pushes summary to history (keeping last {@link MAX_SUMMARY_HISTORY}),
     * detects failure pattern, determines pressure level, selects/advances
     * methodology, builds pressure prompt, and persists PUA state to
     * StatusFile.
     */
    handleFailure(summary: string, consecutiveFailures: number): void;
    /**
     * Safely write PUA fields to StatusFile.
     * Wraps in try/catch and logs warning on failure.
     */
    safeWriteFields(fields: PuaStatusFields): void;
    /**
     * Safely clear PUA fields from StatusFile.
     * Wraps in try/catch and logs warning on failure.
     */
    safeClearFields(): void;
    /**
     * Restore PUA context from StatusFile for prompt building.
     *
     * Reads persisted PUA fields from the StatusFile content, restores
     * internal methodology chain state, and builds a {@link PuaContext}
     * for injection into the iteration prompt.
     *
     * Returns `undefined` if no PUA state is persisted or if restoration
     * fails (graceful degradation).
     *
     * @param statusContent - Raw StatusFile content string.
     * @param consecutiveFailures - Current consecutive failure count from orchestrator state.
     * @returns Restored PUA context, or `undefined`.
     */
    restoreContext(statusContent: string, consecutiveFailures: number): PuaContext | undefined;
}
