/**
 * Verdict parser for Forge_Verify Three-State Verdict.
 *
 * Parses `verdict.md` content into a structured `ParsedVerdict`.
 * Total function: any string input produces a valid result with
 * verdict ∈ {"VERIFIED", "NOT_VERIFIED", "INCONCLUSIVE"}.
 *
 * **Validates: Requirements R1.9, R13.3**
 */
/** Valid three-state verdict values. */
export type VerdictValue = "VERIFIED" | "NOT_VERIFIED" | "INCONCLUSIVE";
/** Result of parsing a verdict.md file. */
export interface ParsedVerdict {
    /** The three-state verdict. Always one of VERIFIED/NOT_VERIFIED/INCONCLUSIVE. */
    readonly verdict: VerdictValue;
    /** The topic being verified, if extractable. */
    readonly topic: string;
    /** Missing artifact paths, if any. */
    readonly missingArtifacts: readonly string[];
    /** Reason for INCONCLUSIVE, if applicable. */
    readonly inconclusiveReason: string | null;
    /** The raw content that was parsed. */
    readonly raw: string;
}
/**
 * Parse a verdict.md content string into a structured ParsedVerdict.
 *
 * This is a total function: any input (including empty, corrupted, or
 * garbage strings) produces a result with verdict ∈ {VERIFIED, NOT_VERIFIED, INCONCLUSIVE}.
 * Unparseable or invalid inputs default to INCONCLUSIVE.
 */
export declare function parseVerdict(content: string): ParsedVerdict;
