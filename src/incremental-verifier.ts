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
export const INCREMENTAL_THRESHOLD = 50;

/** @public */
export function determineVerificationStrategy(
  linesChanged: number,
  threshold = INCREMENTAL_THRESHOLD,
): VerificationDecision {
  if (linesChanged < 0) {
    throw new Error(`linesChanged must be non-negative, got ${linesChanged}`);
  }
  return {
    strategy: linesChanged < threshold ? "incremental" : "targeted-review",
    linesChanged,
    threshold,
  };
}

/** @public */
export function buildVerificationCriteria(finding: ChecklistEntry): {
  filePath: string;
  lineRange: [number, number];
  description: string;
} {
  return {
    filePath: finding.filePath,
    lineRange: [finding.lineNumber, finding.lineNumber],
    description: finding.description,
  };
}
