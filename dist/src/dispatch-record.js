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
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const REQUIRED_FIELDS = [
    "subcommand",
    "mode",
    "run_id",
    "session_id",
    "workflow_state_id",
    "workflow_version",
    "gate_enabled",
    "workflow_available",
    "chosen_level",
    "exit_code",
    "duration_ms",
    "timestamp",
    "frozen_zone_blocked",
];
/**
 * Validate that `record` carries every required field. Throws on the first
 * missing key — callers using TS already get static safety; this guards
 * the `unknown` boundary (e.g. JSONL line read back from disk in tests).
 */
export function assertValidDispatchRecord(record) {
    if (!record || typeof record !== "object") {
        throw new Error(`dispatch record must be an object, got ${typeof record}`);
    }
    for (const key of REQUIRED_FIELDS) {
        if (!(key in record)) {
            throw new Error(`dispatch record missing required field: ${key}`);
        }
    }
}
/**
 * Append a DispatchRecord as a single JSON line to
 * `<forgeRoot>/runs/<runId>/dispatch.jsonl`. Creates parent dirs as needed.
 *
 * Validates the record before writing — protects the JSONL from divergent
 * shapes regardless of which call site (dispatcher vs audit-writer)
 * produced it.
 */
export function appendDispatchRecord(forgeRoot, runId, record) {
    assertValidDispatchRecord(record);
    const runDir = join(forgeRoot, "runs", runId);
    mkdirSync(runDir, { recursive: true });
    const path = join(runDir, "dispatch.jsonl");
    appendFileSync(path, `${JSON.stringify(record)}\n`);
    return path;
}
/**
 * Build a placeholder DispatchRecord for a frozen-zone violation that
 * occurs during an audit write. The audit-writer surfaces the violation
 * from outside the L0/L1 ladder, so most ladder-context fields are
 * filled with sentinels (n/a).
 *
 * Callers passing real ladder context should use `appendDispatchRecord`
 * directly with their own DispatchRecord.
 */
export function frozenZoneRecord(subcommand, runId, sessionId = "n/a") {
    return {
        subcommand,
        mode: "interactive",
        run_id: runId,
        session_id: sessionId,
        workflow_state_id: "n/a",
        workflow_version: "n/a",
        gate_enabled: false,
        workflow_available: false,
        chosen_level: "L1",
        l0_failure_signature: "frozen_zone_blocked",
        exit_code: 1,
        duration_ms: 0,
        timestamp: new Date().toISOString(),
        frozen_zone_blocked: true,
    };
}
//# sourceMappingURL=dispatch-record.js.map