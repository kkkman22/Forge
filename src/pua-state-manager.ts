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

import type { FailurePattern, Methodology, PuaContext, TaskType } from "./pua-engine.js";
import {
  advanceMethodology,
  buildPressurePrompt,
  detectFailurePattern,
  determinePressureLevel,
  getMethodologyChain,
  getStallResponse,
  MAX_SUMMARY_HISTORY,
  selectMethodology,
} from "./pua-engine.js";
import type { PuaStatusFields } from "./status-file-ext.js";
import { clearPuaFields, extractPuaFields, writePuaFields } from "./status-file-ext.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// PuaStateManager
// ---------------------------------------------------------------------------

/**
 * Manages PUA engine state across iterations.
 *
 * Extracted from `SdkDriver` to reduce cognitive load and improve
 * testability. Maintains identical behavior to the original inline
 * implementation.
 */
export class PuaStateManager {
  /** Most recent iteration summaries (kept to last {@link MAX_SUMMARY_HISTORY}). */
  private summaryHistory: string[] = [];
  /** Current position in the methodology switch chain. */
  private methodologyChainIndex = 0;
  /** Current methodology switch chain (set when a failure pattern is first detected). */
  private currentMethodologyChain: Methodology[] | null = null;

  /**
   * @param deps - I/O callbacks for StatusFile access and warning output.
   * @param taskType - Task type for methodology routing when no failure pattern is detected.
   */
  constructor(
    private readonly deps: PuaStateManagerDeps,
    private readonly taskType: TaskType | string = "general",
  ) {}

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Handle PUA state after a successful iteration.
   *
   * Clears summary history, resets methodology chain index, and removes
   * PUA fields from StatusFile.
   */
  handleSuccess(): void {
    try {
      this.summaryHistory = [];
      this.methodologyChainIndex = 0;
      this.currentMethodologyChain = null;
      this.safeClearFields();
    } catch (err) {
      this.deps.warn(
        `Warning: PUA success cleanup failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
      );
    }
  }

  /**
   * Handle PUA state after a failed iteration.
   *
   * Pushes summary to history (keeping last {@link MAX_SUMMARY_HISTORY}),
   * detects failure pattern, determines pressure level, selects/advances
   * methodology, builds pressure prompt, and persists PUA state to
   * StatusFile.
   */
  handleFailure(summary: string, consecutiveFailures: number): void {
    try {
      // Push summary to history (keep last MAX_SUMMARY_HISTORY)
      this.summaryHistory.push(summary);
      if (this.summaryHistory.length > MAX_SUMMARY_HISTORY) {
        this.summaryHistory = this.summaryHistory.slice(-MAX_SUMMARY_HISTORY);
      }

      // Detect failure pattern
      const failurePattern = detectFailurePattern(this.summaryHistory);

      // Determine pressure level
      const hasStall = failurePattern === "spinning";
      const pressureLevel = determinePressureLevel(consecutiveFailures, hasStall);

      // Methodology selection/advancement
      let methodology: Methodology | null = null;
      if (pressureLevel !== "L0") {
        if (failurePattern !== null) {
          if (this.currentMethodologyChain === null) {
            // First time detecting this failure pattern — get the chain
            this.currentMethodologyChain = getMethodologyChain(failurePattern);
            this.methodologyChainIndex = 0;
            methodology = this.currentMethodologyChain[0] ?? null;
          } else {
            // Advance in the existing chain
            const next = advanceMethodology(
              this.currentMethodologyChain,
              this.methodologyChainIndex,
            );
            if (next !== null) {
              this.methodologyChainIndex++;
              methodology = next;
            } else {
              // Chain exhausted — don't block Orchestrator's normal circuit-breaking
              methodology = null;
            }
          }
        } else {
          // No failure pattern detected — use task-type-based methodology
          methodology = selectMethodology(this.taskType);
        }
      }

      // Build pressure prompt — return value intentionally discarded.
      // PUA state (pressureLevel, methodology, failurePattern) is persisted to
      // StatusFile via safeWriteFields below. On the next iteration,
      // restoreContext reads from StatusFile and calls buildPressurePrompt
      // there to produce the prompt string.
      const stallResponse = getStallResponse(consecutiveFailures);
      buildPressurePrompt(pressureLevel, methodology, failurePattern, stallResponse);

      // Persist PUA state to StatusFile
      this.safeWriteFields({
        puaPressureLevel: pressureLevel,
        puaMethodology: methodology ?? undefined,
        puaChainIndex: this.methodologyChainIndex,
        puaFailurePattern: failurePattern ?? undefined,
      });
    } catch (err) {
      // PUA engine error — degrade gracefully, continue without PUA
      this.deps.warn(
        `Warning: PUA failure handling failed, continuing without PUA: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
      );
    }
  }

  /**
   * Safely write PUA fields to StatusFile.
   * Wraps in try/catch and logs warning on failure.
   */
  safeWriteFields(fields: PuaStatusFields): void {
    try {
      const currentContent = this.deps.readStatusFile();
      const updatedContent = writePuaFields(currentContent, fields);
      this.deps.writeStatusFile(updatedContent);
    } catch (err) {
      this.deps.warn(
        `Warning: failed to write PUA fields to StatusFile: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
      );
    }
  }

  /**
   * Safely clear PUA fields from StatusFile.
   * Wraps in try/catch and logs warning on failure.
   */
  safeClearFields(): void {
    try {
      const currentContent = this.deps.readStatusFile();
      const clearedContent = clearPuaFields(currentContent);
      this.deps.writeStatusFile(clearedContent);
    } catch (err) {
      this.deps.warn(
        `Warning: failed to clear PUA fields from StatusFile: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
      );
    }
  }

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
  restoreContext(statusContent: string, consecutiveFailures: number): PuaContext | undefined {
    try {
      const puaFields = extractPuaFields(statusContent);

      // Restore methodology chain state from persisted fields
      if (puaFields.puaChainIndex !== undefined) {
        this.methodologyChainIndex = puaFields.puaChainIndex;
      }
      if (puaFields.puaFailurePattern !== undefined && this.currentMethodologyChain === null) {
        try {
          this.currentMethodologyChain = getMethodologyChain(
            puaFields.puaFailurePattern as FailurePattern,
          );
        } catch (err) {
          this.deps.warn(
            `[debug] PUA failure pattern restoration failed for pattern "${puaFields.puaFailurePattern}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Build PUA context if we have persisted pressure state
      if (puaFields.puaPressureLevel !== undefined) {
        const methodology = (puaFields.puaMethodology as Methodology | undefined) ?? null;
        const failurePattern = (puaFields.puaFailurePattern as FailurePattern | undefined) ?? null;
        const stallResponse =
          consecutiveFailures > 0 ? getStallResponse(consecutiveFailures) : null;
        const pressurePrompt = buildPressurePrompt(
          puaFields.puaPressureLevel,
          methodology,
          failurePattern,
          stallResponse,
        );
        return {
          pressureLevel: puaFields.puaPressureLevel,
          methodology,
          failurePattern,
          stallResponse,
          pressurePrompt,
        };
      }

      return undefined;
    } catch (err) {
      // PUA engine error — degrade gracefully, continue without PUA
      this.deps.warn(
        `Warning: PUA state restoration failed, continuing without PUA: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
      );
      return undefined;
    }
  }
}
