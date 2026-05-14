/**
 * StatusFile interaction helpers — pure helper functions extracted from
 * SdkDriver to encapsulate all StatusFile read/write operations.
 *
 * These are standalone functions (not a class) since they hold no state.
 * They operate on a `StatusFileIO` interface for dependency injection,
 * keeping them decoupled from `SdkDriverConfig` callbacks.
 *
 * Each function wraps in try/catch matching the existing graceful
 * degradation pattern from SdkDriver.
 *
 * Design reference: audit-remediation § 6. StatusFile Interaction Extraction
 * **Validates: Requirements 6.1, 6.2, 6.5**
 */
/**
 * Dependency-injected I/O interface for StatusFile operations.
 *
 * Decouples the helper functions from the concrete `SdkDriverConfig`
 * callbacks, making them testable with simple stubs.
 */
export interface StatusFileIO {
    /** Read the current StatusFile content. */
    read: () => string;
    /** Write new content to the StatusFile. */
    write: (content: string) => void;
}
/**
 * Read StatusFile content via the IO interface.
 *
 * Returns empty string if `io` is undefined (no callback configured)
 * or if reading fails. Logs a debug warning on failure.
 *
 * @param io - StatusFile IO callbacks, or undefined.
 * @returns StatusFile content string, or empty string.
 */
export declare function safeReadStatusFile(io: StatusFileIO | undefined): string;
/**
 * Write StatusFile content via the IO interface.
 *
 * Silently ignores failures — StatusFile updates are non-critical.
 * Does nothing if `io` is undefined (no callback configured).
 *
 * @param io - StatusFile IO callbacks, or undefined.
 * @param content - Content to write.
 */
export declare function safeWriteStatusFile(io: StatusFileIO | undefined, content: string): void;
/**
 * Extract the `phase` field from StatusFile content.
 *
 * @param content - Raw StatusFile content string.
 * @returns The phase string, or null if not found.
 */
export declare function getPhaseFromStatus(content: string): string | null;
/**
 * Extract the `tier` field from StatusFile content.
 *
 * @param content - Raw StatusFile content string.
 * @returns The tier string, or undefined if not found.
 */
export declare function getTierFromStatus(content: string): string | undefined;
/**
 * Safely update StatusFile with current phase and iteration number.
 *
 * Reads the current content, applies the update via `updateIterationStatus`,
 * and writes back. Wraps in try/catch and logs a warning on failure.
 *
 * @param io - StatusFile IO callbacks, or undefined.
 * @param phase - The current SKILL phase identifier.
 * @param iteration - The current Loop iteration number.
 */
export declare function safeUpdateIterationStatus(io: StatusFileIO | undefined, phase: string, iteration: number): void;
/**
 * Initialize Loop-related fields in StatusFile at startup.
 *
 * Writes `mode: "autonomous"`, `loop_run_id`, `loop_iteration: 0`, and
 * `skill_sequence` to the StatusFile. If residual Loop state from a
 * previous abnormal exit is detected (existing `loop_run_id`), clears
 * it first before writing fresh fields.
 *
 * The skill sequence is computed from the tier via `getCommandSequence`.
 *
 * @param io - StatusFile IO callbacks, or undefined.
 * @param runId - Unique identifier for this run.
 * @param tier - Routing tier (e.g. "standard").
 */
export declare function initializeLoopFields(io: StatusFileIO | undefined, runId: string, tier: string): void;
/**
 * Clear Loop-related fields from StatusFile on shutdown.
 *
 * On normal completion (`completedNormally === true`): clears ALL Loop
 * fields — `mode`, `loop_run_id`, `loop_iteration`, `skill_sequence`.
 *
 * On abnormal exit (`completedNormally === false`): clears `mode`,
 * `loop_run_id`, `loop_iteration` but preserves `skill_sequence`
 * (for potential `/forge resume`).
 *
 * @param io - StatusFile IO callbacks, or undefined.
 * @param completedNormally - Whether the loop completed normally.
 */
export declare function clearLoopFieldsOnShutdown(io: StatusFileIO | undefined, completedNormally: boolean): void;
