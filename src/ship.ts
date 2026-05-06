/**
 * Ship engine — core logic extracted from forge-ship/SKILL.md.
 *
 * Implements:
 *   - checkShipGate: Verifies all three gates pass before ship is allowed
 *   - checkShipGateWithChecklist: Extended gate with P1 Fix Checklist
 *
 * Per design document:
 *   - Requirements 6.6, 6.7: P0/P1 → block ship; only P2/P3 → allow ship
 *   - Requirements 7.5: Test not passed → block ship
 *   - Requirements 8.1, 8.2: All three gates must pass; any failure → block with reason
 *   - Requirements 10.3: Checklist gate — all P0/P1 entries must be verified
 *   - Requirements 16.3, 16.4: Hard constraints on review and test gates
 */

import type { ChecklistEntry } from "./fix-checklist.js";
import { allEntriesVerified } from "./fix-checklist.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReviewResult {
  /** Whether the review passed (no P0/P1 issues). */
  passed: boolean;
  /** Number of P0 (release-blocking) issues. */
  p0Count: number;
  /** Number of P1 (high-impact) issues. */
  p1Count: number;
  /** Commit hash at the time of review. Optional for backward compatibility. */
  reviewedAtCommit?: string;
}

export interface TestResult {
  /** Whether all tests passed and the pre-completion checklist is satisfied. */
  passed: boolean;
}

export interface ProgressResult {
  /** Total number of tasks in the plan. */
  totalTasks: number;
  /** Number of tasks marked as completed. */
  completedTasks: number;
}

export interface ShipGateResult {
  allowed: boolean;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Review freshness check (design Properties 1-4)
// ---------------------------------------------------------------------------

export interface ReviewFreshnessResult {
  fresh: boolean;
  reason: string;
  /** Non-.forge/ files that changed since review. Only present when fresh=false. */
  changedFiles?: string[];
}

/**
 * Check whether the review report is still fresh relative to the current HEAD.
 *
 * 4 cases:
 *   1. reviewedCommit undefined → fresh (backward compat)
 *   2. reviewedCommit === currentHead → fresh
 *   3. all changed files are under .forge/ → fresh
 *   4. any changed file is outside .forge/ → not fresh
 */
export function checkReviewFreshness(
  reviewedCommit: string | undefined,
  currentHead: string,
  changedFiles: string[],
): ReviewFreshnessResult {
  if (reviewedCommit === undefined) {
    return { fresh: true, reason: "no reviewed_at_commit field (backward compatible)" };
  }

  if (reviewedCommit === currentHead) {
    return { fresh: true, reason: "review matches current HEAD" };
  }

  const nonForgeFiles = changedFiles.filter((f) => !f.startsWith(".forge/"));

  if (nonForgeFiles.length === 0) {
    return { fresh: true, reason: "changes only in .forge/ state files" };
  }

  return {
    fresh: false,
    reason: "project code changed since review",
    changedFiles: nonForgeFiles,
  };
}

// ---------------------------------------------------------------------------
// Ship gate check (Property 11)
// ---------------------------------------------------------------------------

/**
 * Check whether `/forge ship` is allowed to proceed.
 *
 * Per SKILL.md §2 and design Property 11:
 *   - Review must have passed (no P0/P1)
 *   - Test must have passed
 *   - All tasks in progress must be complete
 *   - All three conditions must be true simultaneously
 *
 * Returns { allowed, reasons } where reasons lists all unmet conditions.
 */
export function checkShipGate(
  review: ReviewResult,
  test: TestResult,
  progress: ProgressResult,
): ShipGateResult {
  const reasons: string[] = [];

  // Gate 1: Review passed (no P0/P1)
  if (!review.passed || review.p0Count > 0 || review.p1Count > 0) {
    const issues: string[] = [];
    if (review.p0Count > 0) {
      issues.push(`${review.p0Count} 个 P0`);
    }
    if (review.p1Count > 0) {
      issues.push(`${review.p1Count} 个 P1`);
    }
    const issueDetail =
      issues.length > 0 ? `（${issues.join("、")}）` : "（passed=false 但无 P0/P1，数据不一致）";
    reasons.push(`Review 未通过：发现${issueDetail}问题，需要修复后重新评审`);
  }

  // Gate 2: Test passed
  if (!test.passed) {
    reasons.push("Test 未通过：测试未通过或完成前验证清单有未通过项");
  }

  // Gate 3: Progress complete
  if (progress.completedTasks < progress.totalTasks) {
    const remaining = progress.totalTasks - progress.completedTasks;
    reasons.push(
      `Progress 未完成：${progress.completedTasks}/${progress.totalTasks} 任务完成，还有 ${remaining} 个未完成`,
    );
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}

/**
 * Extended ship gate with P1 Fix Checklist verification.
 *
 * Adds a fourth gate: all checklist entries must have status "verified".
 * When checklist is not provided or empty, behaves like checkShipGate.
 */
export function checkShipGateWithChecklist(
  review: ReviewResult,
  test: TestResult,
  progress: ProgressResult,
  checklist?: ChecklistEntry[],
): ShipGateResult {
  const result = checkShipGate(review, test, progress);

  if (checklist && checklist.length > 0 && !allEntriesVerified(checklist)) {
    const unverified = checklist.filter((e) => e.status !== "verified");
    result.reasons.push(
      `Checklist 未完成：${unverified.length} 个 P0/P1 条目未验证（${unverified.map((e) => e.findingId).join(", ")}）`,
    );
    result.allowed = false;
  }

  return result;
}

/**
 * Extended ship gate with Review Freshness check.
 *
 * Adds a non-blocking freshness warning: if the review was performed at a
 * different commit and project code has changed since, a warning is appended
 * to the reasons. This does NOT block ship — it is advisory only.
 */
export function checkShipGateWithFreshness(
  review: ReviewResult,
  test: TestResult,
  progress: ProgressResult,
  currentHead: string,
  changedFiles: string[],
  checklist?: ChecklistEntry[],
): ShipGateResult {
  const result = checklist
    ? checkShipGateWithChecklist(review, test, progress, checklist)
    : checkShipGate(review, test, progress);

  const freshness = checkReviewFreshness(review.reviewedAtCommit, currentHead, changedFiles);
  if (!freshness.fresh) {
    const fileList = freshness.changedFiles ? ` [${freshness.changedFiles.join(", ")}]` : "";
    result.reasons.push(`⚠️ Review freshness: ${freshness.reason}${fileList}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Evolution artefact helpers (skills-cross-pollination — Requirement 8.7)
// ---------------------------------------------------------------------------

import type { Episode, EpisodeOutcome, EpisodeTier } from "./episode.js";
import {
  buildFailureEpisode,
  buildFailureEvolutionMarker,
  type FailureContext,
} from "./failure-sink.js";

/**
 * Why the ship gate blocked the delivery. Drives the episode outcome:
 *
 *   - `uncommitted`       → `outcome: "partial"`. The work is not lost;
 *                           the gate simply stopped the user from
 *                           shipping before committing their edits.
 *   - `checklist_failed`  → `outcome: "failure"`. The P1 Fix Checklist
 *                           has unverified entries, meaning a review
 *                           finding has not been addressed.
 */
export type ShipGateBlockReason = "uncommitted" | "checklist_failed";

/** Output of {@link buildShipGateBlockArtifacts}. */
export interface ShipGateBlockArtifacts {
  episode: Episode;
  markerText: string;
}

/**
 * Map a {@link ShipGateBlockReason} onto the corresponding episode
 * outcome. Isolated so tests can pin the mapping without constructing
 * a full `FailureContext`.
 */
function outcomeForReason(reason: ShipGateBlockReason): EpisodeOutcome {
  switch (reason) {
    case "uncommitted":
      return "partial";
    case "checklist_failed":
      return "failure";
  }
}

/**
 * Pure helper that constructs the failure artefacts triggered by the
 * ship gate rejecting a delivery.
 *
 * Behaviour (Requirement 8.7):
 *   - Builds a {@link FailureContext} with `skill = "forge-ship"` and
 *     `trigger = "ship_gate_blocked"`, carrying `topic`, `tier`, and
 *     `situation` from the call site.
 *   - Delegates to {@link buildFailureEpisode} for a v2 Episode, then
 *     overrides `outcome` based on `reason`:
 *       - `uncommitted`       → `"partial"`
 *       - `checklist_failed`  → `"failure"` (no override needed — the
 *         failure-sink default already returns `"failure"`).
 *   - Calls {@link buildFailureEvolutionMarker} with the episode id so
 *     the Evolution marker target is `forge-ship#ship_gate_blocked`.
 *
 * Drivers are expected to append the episode to
 * `.forge/knowledge/sessions/<date>-<topic>.md` (Guarded zone) and the
 * marker to the topic's progress file (Open zone). Write failures
 * degrade to a warning per Requirement 8.12 — callers keep the
 * delivery-blocked message front and centre.
 *
 * Pure: identical `(topic, tier, reason, situation, now, sequenceInDay)`
 * always yields identical artefacts.
 */
export function buildShipGateBlockArtifacts(
  topic: string,
  tier: EpisodeTier,
  reason: ShipGateBlockReason,
  situation: string,
  now: Date,
  sequenceInDay: number,
): ShipGateBlockArtifacts {
  const ctx: FailureContext = {
    skill: "forge-ship",
    topic,
    tier,
    trigger: "ship_gate_blocked",
    situation,
  };

  const baseEpisode = buildFailureEpisode(ctx, now, sequenceInDay);
  const desiredOutcome = outcomeForReason(reason);
  const episode: Episode =
    baseEpisode.outcome === desiredOutcome
      ? baseEpisode
      : { ...baseEpisode, outcome: desiredOutcome };

  const markerText = buildFailureEvolutionMarker(ctx, episode.id, now);
  return { episode, markerText };
}
