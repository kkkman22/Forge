/**
 * Validation Contract Gate, Spec Leak detection, EARS enforcement.
 *
 * Validates: Requirements 11, 12
 */
import type { SpecBundle } from "./spec-bundle.js";
export interface ContractGateFinding {
    line?: number;
    severity: "P0";
    message: string;
}
export interface ContractGateResult {
    pass: boolean;
    skipped?: boolean;
    findings: ContractGateFinding[];
}
export declare function validateContractGate(bundle: SpecBundle): ContractGateResult;
/**
 * Derive the lenient pattern set from strict + lenient-extras.
 * (lenient = strict − structural-only + lenient-extras)
 *
 * Exposed so callers can inspect the active rule set.
 */
export declare function deriveLenientPatterns(): RegExp[];
export interface SpecLeakFinding {
    /** 1-indexed line within the scanned text. */
    line: number;
    /** Source file the text came from (e.g. "requirements.md"). */
    file: string;
    /** Pattern source string that matched. */
    pattern: string;
    /** Pre-formatted "[spec-leak] file:line" message for log output. */
    message: string;
}
export interface SpecLeakResult {
    leaked: boolean;
    /** Line-anchored findings with file:line tags. */
    findings: SpecLeakFinding[];
}
/**
 * Detect spec leaks from a SpecBundle.
 *
 * - `strict` scans `requirements.md` (intro + EARS criteria) with the full
 *   strict pattern set.
 * - `lenient` scans `design.md` with the lenient set (structural identifiers
 *   removed; legitimate technical names allowed).
 *
 * Output uses `[spec-leak] <file>:<line>` format so it can be tee'd straight
 * into terminal logs and matched by ship-gate scripts.
 */
export declare function detectSpecLeakFromBundle(bundle: SpecBundle, scope: "strict" | "lenient"): SpecLeakResult;
export interface EarsEnforcementResult {
    output: string;
    retries: number;
    exhausted?: boolean;
}
export declare function enforceEarsSyntax(text: string, options?: {
    maxRetries?: number;
    eventsPath?: string;
}): EarsEnforcementResult;
