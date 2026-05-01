/**
 * Incremental verifier — determine verification strategy for P1 fixes.
 *
 * **Validates: Requirements 9.1, 9.2, 9.4**
 */
import type { ChecklistEntry } from "./fix-checklist.js";
export type VerificationStrategy = "incremental" | "targeted-review";
export interface VerificationDecision {
    strategy: VerificationStrategy;
    linesChanged: number;
    threshold: number;
}
export interface VerificationResult {
    verified: boolean;
    findingId: string;
    explanation: string;
    originalLayer?: string;
}
export declare const INCREMENTAL_THRESHOLD = 50;
export declare function determineVerificationStrategy(linesChanged: number, threshold?: number): VerificationDecision;
export declare function buildVerificationCriteria(finding: ChecklistEntry): {
    filePath: string;
    lineRange: [number, number];
    description: string;
};
