/**
 * SDK Notes Manager — extracted notes management logic from SdkDriver.
 *
 * Contains three standalone functions previously defined as private methods
 * on the SdkDriver class:
 *
 * - `buildIterationEntry` — pure function mapping AgentOutput to IterationEntry
 * - `appendAndPersistNotes` — appends an entry to the notes document and persists to disk
 * - `logTokenUsage` — logs cumulative token usage after an iteration
 *
 * Design reference: sdk-driver-decomposition § design.md
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 10.8**
 */

import { appendEntry } from "./context-accumulator.js";
import { createLogEntry } from "./logger/index.js";
import type {
  AgentOutput,
  IterationEntry,
  NotesDocument,
  OrchestratorState,
  TokenUsage,
} from "./loop-types.js";
import { RunManager } from "./run-manager.js";
import type { LogSink } from "./sdk-driver-types.js";

// ---------------------------------------------------------------------------
// buildIterationEntry — pure function
// ---------------------------------------------------------------------------

/**
 * Build an `IterationEntry` from an iteration number, success flag, and
 * agent output. This is a pure function with no side effects.
 *
 * Field mapping:
 * - `number` ← iteration number
 * - `success` ← success flag
 * - `summary` ← `output.summary`
 * - `keyChanges` ← `output.key_changes_made` when successful, `[]` otherwise
 * - `keyLearnings` ← `output.key_learnings`
 */
export function buildIterationEntry(
  number: number,
  success: boolean,
  output: AgentOutput,
): IterationEntry {
  return {
    number,
    success,
    summary: output.summary,
    keyChanges: success ? output.key_changes_made : [],
    keyLearnings: output.key_learnings,
  };
}

// ---------------------------------------------------------------------------
// appendAndPersistNotes — stateful (I/O)
// ---------------------------------------------------------------------------

/**
 * Append an iteration entry to the notes document, persist to disk, and
 * optionally log token usage.
 *
 * Returns the updated `notesDocument` and `notesContent` so the caller
 * (SdkDriver) can apply them to its private state.
 *
 * Note: the `notesDocument` is mutated in place (push to entries array)
 * for consistency with the original SdkDriver behavior. The caller should
 * treat the returned reference as the authoritative copy.
 */
export function appendAndPersistNotes(
  notesDocument: NotesDocument,
  notesContent: string,
  entry: IterationEntry,
  notesPath: string,
  usage?: TokenUsage,
  logger?: LogSink,
  orchestratorState?: OrchestratorState,
  t?: (key: string, params?: Record<string, string>) => string,
  runId?: string,
): { notesDocument: NotesDocument; notesContent: string } {
  // Append entry to the notes document.
  notesDocument.entries.push(entry);
  const updatedNotesContent = appendEntry(notesContent, entry);

  // Persist notes to disk.
  RunManager.persistNotes(notesPath, updatedNotesContent);

  // Log token usage if available and all required dependencies are present.
  if (usage && logger && orchestratorState && t && runId) {
    logTokenUsage(usage, orchestratorState, logger, runId, t);
  }

  return { notesDocument, notesContent: updatedNotesContent };
}

// ---------------------------------------------------------------------------
// logTokenUsage — stateful (logging)
// ---------------------------------------------------------------------------

/**
 * Log cumulative token usage after an iteration.
 *
 * Emits a structured `token_usage` log entry with both per-iteration and
 * cumulative token counts.
 */
export function logTokenUsage(
  usage: TokenUsage,
  orchestratorState: OrchestratorState,
  logger: LogSink,
  runId: string,
  t: (key: string, params?: Record<string, string>) => string,
): void {
  const message = t("driver.loop.iterationTokens", {
    inputTokens: String(usage.inputTokens),
    outputTokens: String(usage.outputTokens),
    cacheReadTokens: String(usage.cacheReadTokens),
    cacheCreationTokens: String(usage.cacheCreationTokens),
    totalInputTokens: String(orchestratorState.totalInputTokens),
    totalOutputTokens: String(orchestratorState.totalOutputTokens),
  });
  logger.log(
    createLogEntry(
      "token_usage",
      "info",
      message,
      {
        runId,
        iteration: orchestratorState.currentIteration,
      },
      {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalInputTokens: orchestratorState.totalInputTokens,
        totalOutputTokens: orchestratorState.totalOutputTokens,
      },
    ),
  );
}
