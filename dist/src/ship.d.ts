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
/** @public */
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
/** @public */
export interface TestResult {
    /** Whether all tests passed and the pre-completion checklist is satisfied. */
    passed: boolean;
}
/** @public */
export interface ProgressResult {
    /** Total number of tasks in the plan. */
    totalTasks: number;
    /** Number of tasks marked as completed. */
    completedTasks: number;
}
/** @public */
export interface ShipGateResult {
    allowed: boolean;
    reasons: string[];
}
/** @public */
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
 * @public
 */
export declare function checkReviewFreshness(reviewedCommit: string | undefined, currentHead: string, changedFiles: string[]): ReviewFreshnessResult;
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
 * @public
 */
export declare function checkShipGate(review: ReviewResult, test: TestResult, progress: ProgressResult): ShipGateResult;
/**
 * Extended ship gate with P1 Fix Checklist verification.
 *
 * Adds a fourth gate: all checklist entries must have status "verified".
 * When checklist is not provided or empty, behaves like checkShipGate.
 * @public
 */
export declare function checkShipGateWithChecklist(review: ReviewResult, test: TestResult, progress: ProgressResult, checklist?: ChecklistEntry[]): ShipGateResult;
/**
 * Extended ship gate with Review Freshness check.
 *
 * Adds a non-blocking freshness warning: if the review was performed at a
 * different commit and project code has changed since, a warning is appended
 * to the reasons. This does NOT block ship — it is advisory only.
 * @public
 */
export declare function checkShipGateWithFreshness(review: ReviewResult, test: TestResult, progress: ProgressResult, currentHead: string, changedFiles: string[], checklist?: ChecklistEntry[]): ShipGateResult;
import type { Episode, EpisodeTier } from "./episode.js";
/**
 * Why the ship gate blocked the delivery. Drives the episode outcome:
 *
 *   - `uncommitted`       → `outcome: "partial"`. The work is not lost;
 *                           the gate simply stopped the user from
 *                           shipping before committing their edits.
 *   - `checklist_failed`  → `outcome: "failure"`. The P1 Fix Checklist
 *                           has unverified entries, meaning a review
 *                           finding has not been addressed.
 * @public
 */
export type ShipGateBlockReason = "uncommitted" | "checklist_failed";
/**
 * Output of {@link buildShipGateBlockArtifacts}.
 * @public
 */
export interface ShipGateBlockArtifacts {
    episode: Episode;
    markerText: string;
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
 *
 * @public
 */
export declare function buildShipGateBlockArtifacts(topic: string, tier: EpisodeTier, reason: ShipGateBlockReason, situation: string, now: Date, sequenceInDay: number): ShipGateBlockArtifacts;
