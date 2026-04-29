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

export const INCREMENTAL_THRESHOLD = 50;

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
