/**
 * Validation Pass result application (ce-inspired-review-enhancement R5).
 *
 * The validation-pass AGENT (agents/validation-pass.md) independently re-verifies
 * each high-severity finding and returns {confirmed, reason, adjusted_confidence}.
 * This module applies the downgrade rules (R5.5/R5.6) that the AGENT must NOT
 * apply itself — keeping the agent's output a pure verdict and centralizing the
 * severity policy in testable pure functions.
 *
 * Design:
 *   - R5.4: ValidationResult shape {confirmed, reason, adjusted_confidence}.
 *   - R5.5: P0 not confirmed → downgrade to P1 + annotate `↓ validation: <reason>`.
 *   - R5.6: P1 not confirmed → downgrade to P2 + annotate.
 *   - R5.6 (clarified in the agent): P2/P3 not confirmed → severity unchanged
 *     (low-impact findings don't escalate from a failed validation).
 *   - R5.8: results serialized to .tinkerman/progress/<slug>-review-validation.jsonl.
 */

import type { MergedFinding, Severity } from "./types.js";

/** The validation agent's verdict on one finding (R5.4). */
export interface ValidationResult {
  /** Whether the finding holds at the stated severity (or higher). */
  confirmed: boolean;
  /** ≤1 sentence: why confirmed or why rejected. */
  reason: string;
  /** Independent confidence 0–100 discrete anchors (R5.4). */
  adjusted_confidence: 0 | 25 | 50 | 75 | 100;
}

/** A finding + its validation result, after the downgrade rule is applied. */
export interface ValidatedFinding {
  /** The finding (severity may have been downgraded). */
  finding: MergedFinding;
  /** The validation verdict that was applied. */
  validation: ValidationResult;
  /** True if severity was downgraded by validation. */
  downgraded: boolean;
}

/**
 * Apply the validation downgrade rule to a single finding (R5.5/R5.6).
 *
 * - P0 not confirmed → P1 + annotate description with `↓ validation: <reason>`.
 * - P1 not confirmed → P2 + annotate.
 * - P2/P3 not confirmed → severity unchanged (no escalation from failed validation).
 * - confirmed → severity unchanged; if adjusted_confidence differs, the caller
 *   may use it to update the finding's confidence (this fn only handles severity).
 *
 * Pure: returns a new finding object; input not mutated.
 */
export function applyValidationResult(
  finding: MergedFinding,
  validation: ValidationResult,
): ValidatedFinding {
  if (validation.confirmed) {
    return { finding, validation, downgraded: false };
  }

  const downgrade: Record<Severity, Severity | null> = {
    P0: "P1", // R5.5
    P1: "P2", // R5.6
    P2: null, // low-impact: no change
    P3: null,
  };
  const newSeverity = downgrade[finding.severity];
  if (newSeverity === null) {
    // P2/P3 not confirmed — severity unchanged (annotate only).
    return {
      finding: {
        ...finding,
        description: `${finding.description} ↓ validation: ${validation.reason}`,
      },
      validation,
      downgraded: false,
    };
  }

  return {
    finding: {
      ...finding,
      severity: newSeverity,
      description: `${finding.description} ↓ validation: ${validation.reason}`,
    },
    validation,
    downgraded: true,
  };
}

/**
 * Apply validation results to a batch of findings, matching by a stable key
 * (filePath + lineNumber). Findings without a validation result pass through
 * unchanged (R5.1: validation is per-surviving-finding; unmatched → untouched).
 *
 * @param findings the merged findings to validate
 * @param validations a map of "<filePath>:<lineNumber>" → ValidationResult
 */
export function applyValidationBatch(
  findings: MergedFinding[],
  validations: Map<string, ValidationResult>,
): ValidatedFinding[] {
  return findings.map((f) => {
    const key = `${f.filePath}:${f.lineNumber}`;
    const result = validations.get(key);
    if (!result) {
      // No validation result → pass through unchanged.
      return {
        finding: f,
        validation: { confirmed: true, reason: "not validated", adjusted_confidence: 75 },
        downgraded: false,
      };
    }
    return applyValidationResult(f, result);
  });
}

/**
 * Serialize validation results to a JSONL line for
 * `.tinkerman/progress/<slug>-review-validation.jsonl` (R5.8).
 */
export function serializeValidationRecord(slug: string, validated: ValidatedFinding): string {
  return JSON.stringify({
    slug,
    timestamp: new Date().toISOString(),
    filePath: validated.finding.filePath,
    lineNumber: validated.finding.lineNumber,
    severity_before: originalSeverity(validated),
    severity_after: validated.finding.severity,
    confirmed: validated.validation.confirmed,
    reason: validated.validation.reason,
    adjusted_confidence: validated.validation.adjusted_confidence,
    downgraded: validated.downgraded,
  });
}

/** Best-effort recovery of the pre-validation severity from the description annotation. */
function originalSeverity(v: ValidatedFinding): Severity {
  // If downgraded, the original was one step more severe.
  if (v.downgraded) {
    if (v.finding.severity === "P1") return "P0";
    if (v.finding.severity === "P2") return "P1";
  }
  return v.finding.severity;
}
