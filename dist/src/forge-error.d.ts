/**
 * Base error class for all forge-loop errors.
 * Provides a machine-readable error code for programmatic handling.
 *
 * All domain-specific error classes should extend `ForgeError` and define
 * a unique `code` string for programmatic discrimination.
 *
 * **Validates: Requirements 9.1, 9.2**
 */
export declare abstract class ForgeError extends Error {
    /** Machine-readable error code unique to each subclass. */
    abstract readonly code: string;
    constructor(message: string);
}
import type { Threat } from "./prompt-defense.js";
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
