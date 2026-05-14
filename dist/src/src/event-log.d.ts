/**
 * Event Log — append-only JSON Lines event stream for forge-loop runs.
 *
 * Each iteration the orchestrator produces a single `EventLogEntry` that
 * captures:
 *   - the triggering `OrchestratorEvent`
 *   - a hash of the state before and after the transition
 *   - the list of side-effects the transition emitted
 *
 * Entries are serialized as single-line JSON (JSONL) and appended to
 * `.forge/runs/<runId>/events.jsonl` by the `write_event_log` effect
 * handler in `effect-executor.ts`. The stream is replayable: applying
 * `replay(initial, entries)` reproduces the final state that the driver
 * persisted at run completion.
 *
 * All functions in this module are pure — they perform no IO and
 * maintain no state. File writes live in the effect executor so the
 * orchestrator itself stays side-effect free.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.8, 3.9**
 */
import type { OrchestratorEffect, OrchestratorEvent, OrchestratorState } from "./loop-types.js";
/**
 * A single event-log entry.
 *
 *  - `timestamp`:       ISO 8601 with millisecond precision
 *  - `runId`:           opaque run identifier assigned by the driver
 *  - `iteration`:       the iteration number associated with the event
 *  - `event`:           the `OrchestratorEvent` that drove the transition
 *  - `stateHashBefore`: 16-hex-char SHA-256 prefix of the pre-transition state
 *  - `stateHashAfter`:  SHA-256 prefix of the post-transition state
 *  - `effects`:         effects produced by the transition
 */
export interface EventLogEntry {
    timestamp: string;
    runId: string;
    iteration: number;
    event: OrchestratorEvent;
    stateHashBefore: string;
    stateHashAfter: string;
    effects: OrchestratorEffect[];
}
/**
 * Stable JSON serialization: objects are emitted with keys in lexicographic
 * order so that semantically identical states produce byte-identical
 * output regardless of property insertion order.
 *
 * Arrays preserve their element order; primitive values serialize via
 * `JSON.stringify`. Non-finite numbers are coerced to `null` (matching
 * `JSON.stringify` behaviour), ensuring round-trip safety.
 */
export declare function stableStringify(value: unknown): string;
/**
 * Compute a stable 16-character hex hash of the orchestrator state.
 *
 * The state is first canonicalised via `stableStringify` so that object
 * key ordering cannot affect the result. The SHA-256 digest is then
 * truncated to its first 16 hex characters — 64 bits of entropy, which
 * is ample for integrity checking in a single-session event log while
 * keeping the on-disk format compact.
 */
export declare function hashState(state: OrchestratorState): string;
/**
 * Build an `EventLogEntry` from the pre/post state pair and the list of
 * effects produced by a transition. The `timestamp` is supplied by the
 * caller so the function stays deterministic for testing.
 */
export declare function buildEntry(runId: string, iteration: number, event: OrchestratorEvent, stateBefore: OrchestratorState, stateAfter: OrchestratorState, effects: OrchestratorEffect[], timestamp?: string): EventLogEntry;
/**
 * Serialize an entry as a single JSONL line (no trailing newline; the
 * caller appends a `\n` when writing to the file).
 */
export declare function serializeEntry(entry: EventLogEntry): string;
/**
 * Parse a JSONL event log into a list of entries.
 *
 * Empty lines are skipped. Malformed lines raise a descriptive error
 * including the line number so callers can surface the offending
 * location. The order of returned entries matches the order in the
 * source stream.
 */
export declare function parseEventLog(jsonl: string): EventLogEntry[];
/**
 * Replay an event stream to reconstruct the final orchestrator state.
 *
 * Starts from the given `initial` state and applies each entry's event
 * via `transition` in order. The side-effects produced by each transition
 * are discarded — replay does not reissue commits, rollbacks, or similar
 * real-world actions.
 *
 * Callers can compare `hashState(replay(initial, entries))` against the
 * `stateHashAfter` of the last entry to detect divergence between the
 * event log and the persisted final state (Requirement 3.7).
 */
export declare function replay(initial: OrchestratorState, entries: EventLogEntry[]): OrchestratorState;
/**
 * Validate a resume path by replaying the event log and comparing the
 * final replayed state's hash with `persistedFinalHash`.
 *
 * Throws `EventLogReplayError` when the hashes disagree. Returns the
 * replayed final state on success so callers can use it directly.
 *
 * The `persistedFinalHash` argument is typically `hashState` of the
 * `state-final.json` snapshot the driver writes at run completion
 * (Requirement 3.7).
 */
export declare function validateResume(initial: OrchestratorState, entries: EventLogEntry[], persistedFinalHash: string): OrchestratorState;
