/**
 * Incremental verifier — determine verification strategy for P1 fixes.
 *
 * **Validates: Requirements 9.1, 9.2, 9.4**
 */
import type { ChecklistEntry } from "./fix-checklist.js";
/** @public */
export type VerificationStrategy = "incremental" | "targeted-review";
/** @public */
export interface VerificationDecision {
    strategy: VerificationStrategy;
    linesChanged: number;
    threshold: number;
}
/** @public */
export interface VerificationResult {
    verified: boolean;
    findingId: string;
    explanation: string;
    originalLayer?: string;
}
/** @public */
export declare const INCREMENTAL_THRESHOLD = 50;
/** @public */
export declare function determineVerificationStrategy(linesChanged: number, threshold?: number): VerificationDecision;
/** @public */
export declare function buildVerificationCriteria(finding: ChecklistEntry): {
    filePath: string;
    lineRange: [number, number];
    description: string;
};
