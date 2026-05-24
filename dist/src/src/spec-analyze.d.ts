/**
 * Analyze Requirements pre-check — 5 rules (ANL-01~05).
 *
 * Called between requirements lock and design generation.
 * P0 → block lock; P1 → block entering design; P2/P3 → warning only.
 *
 * Validates: Requirement 3
 */
import type { RequirementsDocument } from "./spec-bundle.js";
export type AnalyzeSeverity = "P0" | "P1" | "P2" | "P3";
export interface AnalyzeFinding {
    rule: string;
    severity: AnalyzeSeverity;
    message: string;
    line?: number;
}
export interface AnalyzeResult {
    pass: boolean;
    shouldBlockDesign: boolean;
    findings: AnalyzeFinding[];
}
export declare function analyzeRequirements(req: RequirementsDocument): AnalyzeResult;
