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

import { getWorkNatureSequenceKey, type Tier, type WorkNature } from "./router.js";
import { getCommandSequence } from "./skill-scheduler.js";
import {
  clearLoopFields,
  extractLoopFields,
  updateIterationStatus,
  writeLoopFields,
} from "./status-file-ext.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Read / Write helpers
// ---------------------------------------------------------------------------

/**
 * Read StatusFile content via the IO interface.
 *
 * Returns empty string if `io` is undefined (no callback configured)
 * or if reading fails. Logs a debug warning on failure.
 *
 * @param io - StatusFile IO callbacks, or undefined.
 * @returns StatusFile content string, or empty string.
 */
export function safeReadStatusFile(io: StatusFileIO | undefined): string {
  if (!io) return "";
  try {
    return io.read();
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: standalone utility without logger access
    console.warn(
      `[debug] safeReadStatusFile failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return "";
  }
}

/**
 * Write StatusFile content via the IO interface.
 *
 * Silently ignores failures — StatusFile updates are non-critical.
 * Does nothing if `io` is undefined (no callback configured).
 *
 * @param io - StatusFile IO callbacks, or undefined.
 * @param content - Content to write.
 */
export function safeWriteStatusFile(io: StatusFileIO | undefined, content: string): void {
  if (!io) return;
  io.write(content);
}

// ---------------------------------------------------------------------------
// Field extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract the `phase` field from StatusFile content.
 *
 * @param content - Raw StatusFile content string.
 * @returns The phase string, or null if not found.
 */
export function getPhaseFromStatus(content: string): string | null {
  const match = content.match(/^phase:\s*"?([^"\n]*)"?\s*$/m);
  return match ? match[1].trim() : null;
}

/**
 * Extract the `tier` field from StatusFile content.
 *
 * @param content - Raw StatusFile content string.
 * @returns The tier string, or undefined if not found.
 */
export function getTierFromStatus(content: string): string | undefined {
  const match = content.match(/^tier:\s*"?([^"\n]*)"?\s*$/m);
  return match ? match[1].trim() : undefined;
}

/**
 * Extract the `work_nature` field from StatusFile content.
 *
 * @param content - Raw StatusFile content string.
 * @returns The work_nature string, or undefined if not found.
 */
export function getWorkNatureFromStatus(content: string): string | undefined {
  const match = content.match(/^work_nature:\s*"?([^"\n]*)"?\s*$/m);
  return match ? match[1].trim() : undefined;
}

// ---------------------------------------------------------------------------
// Compound operations
// ---------------------------------------------------------------------------

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
export function safeUpdateIterationStatus(
  io: StatusFileIO | undefined,
  phase: string,
  iteration: number,
): void {
  try {
    const currentContent = safeReadStatusFile(io);
    const updatedContent = updateIterationStatus(currentContent, phase, iteration);
    safeWriteStatusFile(io, updatedContent);
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: standalone utility without logger access
    console.warn(
      `Warning: failed to update StatusFile iteration status: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Initialize Loop-related fields in StatusFile at startup.
 *
 * Writes `mode: "autonomous"`, `loop_run_id`, `loop_iteration: 0`, and
 * `skill_sequence` to the StatusFile. If residual Loop state from a
 * previous abnormal exit is detected (existing `loop_run_id`), clears
 * it first before writing fresh fields.
 *
 * The skill sequence is computed from the tier and optional workNature
 * via `getWorkNatureSequenceKey` + `getCommandSequence`.
 *
 * @param io - StatusFile IO callbacks, or undefined.
 * @param runId - Unique identifier for this run.
 * @param tier - Routing tier (e.g. "standard").
 * @param workNature - Optional work nature (feature, refactor, bugfix).
 *   When provided, selects WorkNature-aware command sequences.
 */
export function initializeLoopFields(
  io: StatusFileIO | undefined,
  runId: string,
  tier: string,
  workNature?: string,
): void {
  let currentContent = safeReadStatusFile(io);

  // Detect residual Loop state from previous abnormal exit (Req 6.5, 10.5).
  const existingFields = extractLoopFields(currentContent);
  if (existingFields.loopRunId) {
    // Residual state found — clean it before writing new fields.
    currentContent = clearLoopFields(currentContent);
  }

  // Determine skill sequence from tier + workNature.
  const sequenceKey = workNature
    ? getWorkNatureSequenceKey(workNature as WorkNature, tier as Tier)
    : tier;
  const skillSequence = getCommandSequence(sequenceKey).map(String);

  // Write fresh Loop fields (Req 6.1, 6.6).
  const updatedContent = writeLoopFields(currentContent, {
    mode: "autonomous",
    loopRunId: runId,
    loopIteration: 0,
    skillSequence,
    workNature,
  });

  safeWriteStatusFile(io, updatedContent);
}

/**
 * Clear Loop-related fields from StatusFile on shutdown.
 *
 * On normal completion (`completedNormally === true`): clears ALL Loop
 * fields — `mode`, `loop_run_id`, `loop_iteration`, `skill_sequence`.
 *
 * On abnormal exit (`completedNormally === false`): clears `mode`,
 * `loop_run_id`, `loop_iteration` but preserves `skill_sequence`
 * (for potential `/tinkerman resume`).
 *
 * @param io - StatusFile IO callbacks, or undefined.
 * @param completedNormally - Whether the loop completed normally.
 */
export function clearLoopFieldsOnShutdown(
  io: StatusFileIO | undefined,
  completedNormally: boolean,
): void {
  const currentContent = safeReadStatusFile(io);

  if (completedNormally) {
    // Normal completion (Req 6.3): clear ALL Loop fields.
    const clearedContent = clearLoopFields(currentContent);
    safeWriteStatusFile(io, clearedContent);
  } else {
    // Abnormal exit (Req 6.4): clear mode, loop_run_id, loop_iteration
    // but preserve phase (already preserved by clearLoopFields) and skill_sequence.
    const existingFields = extractLoopFields(currentContent);
    const clearedContent = clearLoopFields(currentContent);

    if (existingFields.skillSequence && existingFields.skillSequence.length > 0) {
      // Write back the skill_sequence that was cleared.
      const restoredContent = writeLoopFields(clearedContent, {
        skillSequence: existingFields.skillSequence,
      });
      safeWriteStatusFile(io, restoredContent);
    } else {
      safeWriteStatusFile(io, clearedContent);
    }
  }
}
