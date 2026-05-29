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
import type { AgentOutput, IterationEntry, NotesDocument, OrchestratorState, TokenUsage } from "./loop-types.js";
import type { LogSink } from "./sdk-driver-types.js";
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
export declare function buildIterationEntry(number: number, success: boolean, output: AgentOutput): IterationEntry;
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
export declare function appendAndPersistNotes(notesDocument: NotesDocument, notesContent: string, entry: IterationEntry, notesPath: string, usage?: TokenUsage, logger?: LogSink, orchestratorState?: OrchestratorState, t?: (key: string, params?: Record<string, string>) => string, runId?: string): {
    notesDocument: NotesDocument;
    notesContent: string;
};
/**
 * Log cumulative token usage after an iteration.
 *
 * Emits a structured `token_usage` log entry with both per-iteration and
 * cumulative token counts.
 */
export declare function logTokenUsage(usage: TokenUsage, orchestratorState: OrchestratorState, logger: LogSink, runId: string, t: (key: string, params?: Record<string, string>) => string): void;
