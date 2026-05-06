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
//# sourceMappingURL=forge-error.js.map