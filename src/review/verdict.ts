/**
 * Verdict handling for review findings (spec `review-unverifiable-verdict`).
 *
 * Problem (obra/superpowers v6.0.0): a reviewer with only pass/fail verdicts
 * either reads unrelated files to "independently verify" a requirement whose
 * code is outside the diff (diluting context / wasting turn budget), or guesses
 * pass/fail to avoid that work. The third verdict `unverifiable` lets the
 * reviewer defer cross-file verification to the controller honestly.
 *
 * Design:
 *   - R1.AC2/AC4: verdict === "unverifiable" requires non-empty
 *     unverifiable_reason and is treated at P2 (needs controller review,
 *     does not block ship).
 *   - R1.AC4: absent verdict → treated as `fail` (conservative, back-compat).
 *   - R3.AC3: a review with any unverifiable finding cannot be marked all-green
 *     until the controller verifies each deferred item.
 *
 * Pure functions; the controller's actual cross-file Read happens outside.
 */

import type { MergedFinding, ReviewFinding, Verdict } from "./types.js";

/**
 * Normalize a finding's verdict, defaulting absent/legacy findings to `fail`.
 *
 * R1.AC4: "finding without verdict field defaults to fail in merge".
 */
export function normalizeVerdict(finding: Pick<ReviewFinding, "verdict">): Verdict {
  return finding.verdict ?? "fail";
}

/** True when a finding is an unverifiable deferral to the controller. */
export function isUnverifiable(finding: Pick<ReviewFinding, "verdict">): boolean {
  return normalizeVerdict(finding) === "unverifiable";
}

/**
 * Validate an unverifiable finding carries the required fields.
 *
 * R1.AC2: unverifiable must have non-empty unverifiable_reason and P2 severity.
 * Returns an error string describing the first violation, or null if valid.
 * Callers downgrade an invalid unverifiable to `fail` (conservative).
 */
export function validateUnverifiable(finding: ReviewFinding): string | null {
  if (normalizeVerdict(finding) !== "unverifiable") return null;
  if (!finding.unverifiable_reason || finding.unverifiable_reason.trim() === "") {
    return "unverifiable finding missing non-empty unverifiable_reason";
  }
  if (finding.severity !== "P2") {
    return `unverifiable finding must be P2 (needs controller review), got ${finding.severity}`;
  }
  return null;
}

/**
 * Coerce a finding into a merge-safe shape:
 *   - invalid unverifiable (missing reason / wrong severity) → verdict reset to `fail`.
 *
 * Returns a new finding object; input is not mutated.
 */
export function coerceVerdict<T extends ReviewFinding>(finding: T): T {
  const error = validateUnverifiable(finding);
  if (error !== null && isUnverifiable(finding)) {
    const { verdict: _v, unverifiable_reason: _u, ...rest } = finding;
    return { ...rest } as T;
  }
  return finding;
}

/** IDs of requirements deferred to the controller (non-empty reasons). */
export interface AllGreenResult {
  allGreen: boolean;
  /** Non-empty when allGreen is false due to unverifiable deferrals. */
  pending_controller_verification: string[];
}

/**
 * Decide whether a set of findings constitutes an all-green review.
 *
 * R3.AC3: any unverifiable finding blocks all-green until the controller
 * verifies it, even when there are no `fail` verdicts. Only P0/P1 fails and
 * unresolved unverifiables block; P2/P3 are advisory.
 *
 * Pure: derives pending_controller_verification from unverifiable reasons.
 */
export function computeAllGreen(
  findings: Array<Pick<MergedFinding, "severity" | "verdict" | "unverifiable_reason">>,
): AllGreenResult {
  const hasBlockingFail = findings.some((f) => {
    const v = normalizeVerdict(f);
    return v === "fail" && (f.severity === "P0" || f.severity === "P1");
  });
  const pending = findings
    .filter(
      (f) => isUnverifiable(f) && f.unverifiable_reason && f.unverifiable_reason.trim() !== "",
    )
    .map((f) => f.unverifiable_reason as string);
  return {
    allGreen: !hasBlockingFail && pending.length === 0,
    pending_controller_verification: pending,
  };
}
