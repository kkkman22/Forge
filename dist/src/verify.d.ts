/**
 * Forge_Verify orchestrator — runs evidence-based verification.
 *
 * Steps:
 *   1. Write Falsifiable_Claim → claim.md
 *   2. Validate claim fields (condition/metric/threshold must be non-empty)
 *   3. Resolve baseline via 4-level fallback
 *   4. Capture baseline and treatment artifacts
 *   5. Compute diff
 *   6. Build Evidence Chain
 *   7. Write verdict.md
 *
 * **Validates: Requirements R1.1–R1.6, R13.3–R13.4, R14.9**
 */
import { type BaselineResolution } from "./baseline-resolver.js";
import type { VerdictValue } from "./verdict-parser.js";
/** A falsifiable claim with required condition/metric/threshold fields. */
export interface FalsifiableClaim {
    condition: string;
    metric: string;
    threshold: string;
}
/** Options for the verify orchestrator. */
export interface VerifyOptions {
    /** The topic being verified. */
    topic: string;
    /** Working directory. Defaults to process.cwd(). */
    cwd?: string;
    /** Path to .forge directory. */
    forgeDir?: string;
    /** The falsifiable claim. */
    claim: FalsifiableClaim;
    /** Optional explicit baseline git ref. */
    baselineRef?: string;
}
/** Result of a verify run. */
export interface VerifyResult {
    /** The three-state verdict. */
    verdict: VerdictValue;
    /** Reason for INCONCLUSIVE, if applicable. */
    inconclusiveReason: string | null;
    /** Files in baseline/ directory. */
    baselineFiles: readonly string[];
    /** Files in treatment/ directory. */
    treatmentFiles: readonly string[];
    /** The baseline resolution used. */
    baselineResolution: BaselineResolution;
    /** Path to the output directory. */
    outputDir: string;
}
/**
 * Run the verify orchestrator.
 *
 * Executes the full verification pipeline: claim validation → baseline
 * resolution → artifact capture → verdict writing.
 */
export declare function runVerify(options: VerifyOptions): Promise<VerifyResult>;
