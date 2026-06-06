/**
 * Core review pipeline — confidence filtering, deduplication, cross-validation.
 *
 * @module review/core
 */

import type {
  ConfidenceFilterResult,
  FixRoute,
  MergedFinding,
  ReviewFinding,
  Severity,
} from "./types.js";
import {
  CONFIDENCE_THRESHOLD,
  CROSS_VALIDATION_BOOST,
  FIX_ROUTE_CONSERVATISM,
  LINE_TOLERANCE,
  LOW_CONFIDENCE_MIN,
  MAX_CONFIDENCE,
  SEVERITY_RANK,
} from "./types.js";

/**
 * Filter findings by confidence threshold.
 *
 * Per SKILL.md §6:
 *   - ≥ 0.8 → report
 *   - 0.5–0.7 → low-confidence log
 *   - < 0.5 → discard
 */
export function filterByConfidence(findings: ReviewFinding[]): ConfidenceFilterResult {
  const included: ReviewFinding[] = [];
  const lowConfidence: ReviewFinding[] = [];
  const discarded: ReviewFinding[] = [];

  for (const f of findings) {
    if (f.confidence >= CONFIDENCE_THRESHOLD) {
      included.push(f);
    } else if (f.confidence >= LOW_CONFIDENCE_MIN) {
      lowConfidence.push(f);
    } else {
      discarded.push(f);
    }
  }

  return { included, lowConfidence, discarded };
}

/**
 * Deduplicate findings from multiple reviewers.
 *
 * Per SKILL.md §7.1:
 *   - Match on normalized file path + line proximity (±3) + normalized description
 *   - On match: keep highest severity, highest confidence, most conservative fix route
 *   - Track all contributing reviewers
 */
export function deduplicateFindings(findings: ReviewFinding[]): MergedFinding[] {
  const merged: MergedFinding[] = [];

  for (const f of findings) {
    const key = fileDescriptionKey(f);
    let matchIndex = -1;

    for (let i = 0; i < merged.length; i++) {
      const existing = merged[i];
      if (
        fileDescriptionKey(existing) === key &&
        linesAreClose(existing.lineNumber, f.lineNumber)
      ) {
        matchIndex = i;
        break;
      }
    }

    if (matchIndex === -1) {
      merged.push({
        ...f,
        reviewers: [f.reviewer],
        crossValidated: false,
      });
    } else {
      const existing = merged[matchIndex];
      existing.severity = higherSeverity(existing.severity, f.severity);
      existing.confidence = Math.max(existing.confidence, f.confidence);
      existing.fixRoute = moreConservativeRoute(existing.fixRoute, f.fixRoute);
      existing.lineNumber = Math.min(existing.lineNumber, f.lineNumber);
      if (!existing.reviewers.includes(f.reviewer)) {
        existing.reviewers.push(f.reviewer);
      }
    }
  }

  return merged;
}

/**
 * Apply cross-validation confidence boost.
 *
 * Per SKILL.md §7.2:
 *   - When 2+ independent reviewers found the same issue → confidence += 0.10 (cap 1.0)
 *   - Mark as crossValidated
 */
export function applyCrossValidation(findings: MergedFinding[]): MergedFinding[] {
  return findings.map((f) => {
    if (f.reviewers.length >= 2) {
      return {
        ...f,
        confidence: Math.min(f.confidence + CROSS_VALIDATION_BOOST, MAX_CONFIDENCE),
        crossValidated: true,
      };
    }
    return { ...f };
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

function fileDescriptionKey(f: ReviewFinding): string {
  return `${normalizeText(f.filePath)}::${normalizeText(f.description)}`;
}

function linesAreClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= LINE_TOLERANCE;
}

function higherSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}

function moreConservativeRoute(a: FixRoute, b: FixRoute): FixRoute {
  return FIX_ROUTE_CONSERVATISM[a] <= FIX_ROUTE_CONSERVATISM[b] ? a : b;
}
