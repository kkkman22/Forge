/**
 * Base error class for all forge-loop errors.
 * Provides a machine-readable error code for programmatic handling.
 *
 * All domain-specific error classes should extend `ForgeError` and define
 * a unique `code` string for programmatic discrimination.
 *
 * **Validates: Requirements 9.1, 9.2**
 */
import type { z } from "zod";
import type { Threat } from "./prompt-defense.js";
export declare abstract class ForgeError extends Error {
    /** Machine-readable error code unique to each subclass. */
    abstract readonly code: string;
    constructor(message: string);
}
/**
 * A minimal, PII-safe summary of a detected threat.
 *
 * Only the type, the stable pattern id, and optional numeric location are
 * carried — matched content is intentionally excluded so that error
 * payloads never leak the original PII or injected instructions
 * (Requirement 5.12).
 */
export type PromptThreatSummary = Pick<Threat, "type" | "pattern"> & {
    readonly location?: {
        start: number;
        end: number;
    };
};
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
export declare class PromptDefenseError extends ForgeError {
    readonly code: "PROMPT_DEFENSE_REJECTED";
    /** Immutable list of threat summaries — PII-free by construction. */
    readonly threats: ReadonlyArray<PromptThreatSummary>;
    constructor(message: string, threats: ReadonlyArray<Threat>);
}
/**
 * Structured validation issue — either a raw `zod` issue or a
 * pre-normalised `{ path, message }` pair for callers that don't use zod.
 */
export interface SchemaValidationIssue {
    /** Dotted field path, e.g. `"loop_fields.mode"`. */
    readonly path: string;
    /** Human-readable message describing what failed. */
    readonly message: string;
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
export declare class SchemaValidationError extends ForgeError {
    readonly code: "SCHEMA_VALIDATION_FAILED";
    /** Normalised list of validation issues. */
    readonly issues: ReadonlyArray<SchemaValidationIssue>;
    constructor(rawIssues: ReadonlyArray<z.ZodIssue | SchemaValidationIssue>);
}
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
export declare class EventLogReplayError extends ForgeError {
    readonly code: "EVENT_LOG_REPLAY_MISMATCH";
    readonly expectedHash: string;
    readonly actualHash: string;
    constructor(expectedHash: string, actualHash: string);
}
