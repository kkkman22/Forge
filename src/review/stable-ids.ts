/**
 * Stable finding ID assignment (ce-inspired-review-enhancement R8).
 *
 * R8 requires each finding to carry a stable `R-NNN` ID that survives across
 * autofix/re-review rounds so that "#R-003" consistently references the same
 * finding in commit messages and PR descriptions.
 *
 * Design:
 *   - R8.1: format R-NNN (zero-padded to 3 digits).
 *   - R8.2: IDs assigned after sorting severity DESC → confidence DESC →
 *     filePath ASC → lineNumber ASC.
 *   - R8.3: within a session, IDs never renumber even if some findings get
 *     fixed/suppressed — assignment is a one-shot stamp at report time.
 *   - R8.4: re-review rounds continue numbering from (previous max ID + 1);
 *     the caller passes `startCounter` for the continuation.
 *   - R8.5: commit/PR references use R-NNN (the convention this module stamps).
 */

import type { ReviewFinding, Severity } from "./types.js";

/** A finding stamped with its stable R-NNN id. */
export interface StampedFinding {
  /** The stable id in R-NNN format (e.g. "R-001"). */
  id: string;
  /** The underlying finding. */
  finding: ReviewFinding;
}

/** Severity rank for DESC sort (higher severity sorts first → lower rank). */
function severityRankDesc(s: Severity): number {
  switch (s) {
    case "P0":
      return 0;
    case "P1":
      return 1;
    case "P2":
      return 2;
    case "P3":
      return 3;
    default:
      return 4;
  }
}

/**
 * Assign stable R-NNN ids to a list of findings (R8.1/R8.2/R8.3).
 *
 * Sort order (R8.2): severity DESC → confidence DESC → filePath ASC →
 * lineNumber ASC. Ids are then stamped R-001, R-002, … in that order.
 *
 * The returned array is a fresh copy; the input is not mutated. Ids are stable
 * for the lifetime of the returned array — re-running on a different input
 * produces a fresh assignment (R8.3's "never renumber within a session" is
 * upheld by stamping once and not re-sorting after).
 *
 * @param findings the findings to stamp
 * @param startCounter the first number to assign (default 1). Pass
 *   `(previousRoundMaxId + 1)` for re-review continuation (R8.4).
 */
export function assignStableFindingIds(
  findings: ReviewFinding[],
  startCounter = 1,
): StampedFinding[] {
  const sorted = [...findings].sort((a, b) => {
    // severity DESC (P0 first)
    const sev = severityRankDesc(a.severity) - severityRankDesc(b.severity);
    if (sev !== 0) return sev;
    // confidence DESC (higher first)
    const conf = b.confidence - a.confidence;
    if (Math.abs(conf) > 1e-9) return conf;
    // filePath ASC
    const file = a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0;
    if (file !== 0) return file;
    // lineNumber ASC
    return a.lineNumber - b.lineNumber;
  });

  return sorted.map((finding, i) => ({
    id: `R-${String(startCounter + i).padStart(3, "0")}`,
    finding,
  }));
}

/**
 * Extract the numeric suffix from an R-NNN id (for re-review continuation,
 * R8.4 — the caller passes maxId + 1 as the next round's startCounter).
 */
export function parseFindingIdNumber(id: string): number | null {
  const match = id.match(/^R-(\d+)$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Continue numbering across re-review rounds (R8.4): given the previous round's
 * stamped findings and the new round's raw findings, assign new ids starting
 * from (previous max + 1). Previous-round findings keep their ids.
 */
export function continueStableFindingIds(
  previous: StampedFinding[],
  newFindings: ReviewFinding[],
): StampedFinding[] {
  const maxNum = previous.reduce((max, sf) => {
    const n = parseFindingIdNumber(sf.id);
    return n !== null && n > max ? n : max;
  }, 0);
  return assignStableFindingIds(newFindings, maxNum + 1);
}
