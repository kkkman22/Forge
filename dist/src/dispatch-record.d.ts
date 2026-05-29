/**
 * Single source of truth for `dispatch.jsonl` records.
 *
 * Both `workflow-dispatcher.ts` (L0/L1/L2/L3 ladder records) and
 * `workflow-audit-writer.ts` (frozen_zone_blocked records) MUST go through
 * `appendDispatchRecord` so every line in the JSONL conforms to the same
 * 14-field schema.
 *
 * Schema rationale: the L0 dispatcher needs the full ladder context (mode,
 * workflow_state_id, ...) so reviewers can downgrade L0 → L1; the audit
 * writer's frozen-zone violations are also a form of L0 failure (they
 * abort an L0 write and must be downgradable). Splitting them into two
 * shapes meant downstream tools had to branch on field presence.
 *
 * See:
 *   - .forge/reviews/workflows-integration.md F11
 *   - .claude/rules/workflow-fallback-ladder.md §5 field consistency
 */
export type Subcommand = "review" | "decide" | "learn";
export type Mode = "interactive" | "loop";
export type ChosenLevel = "L0" | "L1" | "L2" | "L3";
export type L1TriggerReason = "gate_disabled" | "env_unset" | "non_interactive" | "workflow_missing" | "workflow_syntax_error" | "concurrency_uncontrolled" | "unmatched_state";
export type L0FailureSignature = "bp_exception" | "schema_validation_failed" | "subprocess_crash" | "stuck_timeout" | "frozen_zone_blocked";
export interface DispatchRecord {
    subcommand: string;
    mode: Mode;
    run_id: string;
    session_id: string;
    workflow_state_id: string;
    workflow_version: string;
    gate_enabled: boolean;
    workflow_available: boolean;
    chosen_level: ChosenLevel;
    l1_trigger_reason?: string;
    l0_failure_signature?: string;
    exit_code: number;
    duration_ms: number;
    /** ISO-8601 timestamp. */
    timestamp: string;
    frozen_zone_blocked: boolean;
}
/**
 * Validate that `record` carries every required field. Throws on the first
 * missing key — callers using TS already get static safety; this guards
 * the `unknown` boundary (e.g. JSONL line read back from disk in tests).
 */
export declare function assertValidDispatchRecord(record: unknown): asserts record is DispatchRecord;
/**
 * Append a DispatchRecord as a single JSON line to
 * `<forgeRoot>/runs/<runId>/dispatch.jsonl`. Creates parent dirs as needed.
 *
 * Validates the record before writing — protects the JSONL from divergent
 * shapes regardless of which call site (dispatcher vs audit-writer)
 * produced it.
 */
export declare function appendDispatchRecord(forgeRoot: string, runId: string, record: DispatchRecord): string;
/**
 * Build a placeholder DispatchRecord for a frozen-zone violation that
 * occurs during an audit write. The audit-writer surfaces the violation
 * from outside the L0/L1 ladder, so most ladder-context fields are
 * filled with sentinels (n/a).
 *
 * Callers passing real ladder context should use `appendDispatchRecord`
 * directly with their own DispatchRecord.
 */
export declare function frozenZoneRecord(subcommand: Subcommand, runId: string, sessionId?: string): DispatchRecord;
