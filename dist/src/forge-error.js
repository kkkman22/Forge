/**
 * Base error class for all forge-loop errors.
 * Provides a machine-readable error code for programmatic handling.
 *
 * All domain-specific error classes should extend `ForgeError` and define
 * a unique `code` string for programmatic discrimination.
 *
 * **Validates: Requirements 9.1, 9.2**
 */
export class ForgeError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
    }
}
/**
 * Raised when an input fails the prompt-defense scan and must be rejected.
 *
 * The error carries a minimal summary of the matched threats — only the
 * stable pattern ids, categories, and numeric offsets — so that upstream
 * loggers and CI messages can describe what was blocked without echoing
 * the original injected text.
 *
 * **Validates: Requirements 5.6, 5.12**
 */
export class PromptDefenseError extends ForgeError {
    code = "PROMPT_DEFENSE_REJECTED";
    /** Immutable list of threat summaries — PII-free by construction. */
    threats;
    constructor(message, threats) {
        super(message);
        // Build the summary eagerly so the shape of `threats` is stable and
        // JSON-serialisable for logging.
        this.threats = threats.map((t) => {
            const summary = { type: t.type, pattern: t.pattern };
            if (t.location !== undefined) {
                return { ...summary, location: { start: t.location.start, end: t.location.end } };
            }
            return summary;
        });
    }
}
/**
 * Raised when a state file / config frontmatter fails schema validation.
 *
 * Wraps zod's `ZodIssue[]` (or equivalent pre-normalised issue records)
 * into a stable shape so that upstream loggers and CLI messages can
 * describe failures by field path without importing zod directly.
 *
 * The `message` is built from the combined issues as `"<path>: <msg>; …"`,
 * making it suitable for single-line log output.
 *
 * **Validates: Requirement 2.6**
 */
export class SchemaValidationError extends ForgeError {
    code = "SCHEMA_VALIDATION_FAILED";
    /** Normalised list of validation issues. */
    issues;
    constructor(rawIssues) {
        const issues = rawIssues.map((issue) => {
            if ("path" in issue && typeof issue.path === "string" && "message" in issue) {
                return { path: issue.path, message: issue.message };
            }
            const z = issue;
            return {
                path: z.path.join("."),
                message: z.message,
            };
        });
        const message = issues.map((i) => `${i.path}: ${i.message}`).join("; ");
        super(message);
        this.issues = issues;
    }
}
// ---------------------------------------------------------------------------
// Event Log Replay
// ---------------------------------------------------------------------------
/**
 * Raised when replaying `events.jsonl` yields a state whose hash does
 * not match the persisted `state-final.json` snapshot.
 *
 * This indicates that either the event log or the final-state file has
 * been tampered with, or that the orchestrator's transition function
 * has changed in a backward-incompatible way since the run was
 * recorded.
 *
 * **Validates: Requirement 3.7**
 */
export class EventLogReplayError extends ForgeError {
    code = "EVENT_LOG_REPLAY_MISMATCH";
    expectedHash;
    actualHash;
    constructor(expectedHash, actualHash) {
        super(`Event log replay produced hash ${actualHash}, expected ${expectedHash}. ` +
            "The run may be corrupted or the orchestrator behaviour has changed. " +
            "Use --force-resume to override.");
        this.expectedHash = expectedHash;
        this.actualHash = actualHash;
    }
}
//# sourceMappingURL=forge-error.js.map