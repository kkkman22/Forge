/**
 * Brownfield auto-detection and self-checks.
 *
 * detectBrownfieldSignals: checks git history, prior spec, keywords.
 * runBrownfieldSelfChecks: validates Delta, Current State, Reversibility.
 *
 * Validates: Requirement 9
 */
import type { SpecBundle } from "./spec-bundle.js";
export interface BrownfieldInput {
    hasGitHistory: boolean;
    hasPriorSpec: boolean;
    taskDescription: string;
}
export interface BrownfieldResult {
    brownfield: boolean;
    signals: string[];
}
export interface BrownfieldCheckFinding {
    rule: string;
    severity: "P0" | "P1";
    message: string;
}
export interface BrownfieldCheckResult {
    pass: boolean;
    skipped?: boolean;
    findings: BrownfieldCheckFinding[];
}
export declare function detectBrownfieldSignals(input: BrownfieldInput, eventsPath?: string): BrownfieldResult;
export declare function runBrownfieldSelfChecks(bundle: SpecBundle): BrownfieldCheckResult;
