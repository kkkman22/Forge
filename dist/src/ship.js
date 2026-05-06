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
import { allEntriesVerified } from "./fix-checklist.js";
/**
 * Check whether the review report is still fresh relative to the current HEAD.
 *
 * 4 cases:
 *   1. reviewedCommit undefined → fresh (backward compat)
 *   2. reviewedCommit === currentHead → fresh
 *   3. all changed files are under .forge/ → fresh
 *   4. any changed file is outside .forge/ → not fresh
 */
export function checkReviewFreshness(reviewedCommit, currentHead, changedFiles) {
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
export function checkShipGate(review, test, progress) {
    const reasons = [];
    // Gate 1: Review passed (no P0/P1)
    if (!review.passed || review.p0Count > 0 || review.p1Count > 0) {
        const issues = [];
        if (review.p0Count > 0) {
            issues.push(`${review.p0Count} 个 P0`);
        }
        if (review.p1Count > 0) {
            issues.push(`${review.p1Count} 个 P1`);
        }
        const issueDetail = issues.length > 0 ? `（${issues.join("、")}）` : "（passed=false 但无 P0/P1，数据不一致）";
        reasons.push(`Review 未通过：发现${issueDetail}问题，需要修复后重新评审`);
    }
    // Gate 2: Test passed
    if (!test.passed) {
        reasons.push("Test 未通过：测试未通过或完成前验证清单有未通过项");
    }
    // Gate 3: Progress complete
    if (progress.completedTasks < progress.totalTasks) {
        const remaining = progress.totalTasks - progress.completedTasks;
        reasons.push(`Progress 未完成：${progress.completedTasks}/${progress.totalTasks} 任务完成，还有 ${remaining} 个未完成`);
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
export function checkShipGateWithChecklist(review, test, progress, checklist) {
    const result = checkShipGate(review, test, progress);
    if (checklist && checklist.length > 0 && !allEntriesVerified(checklist)) {
        const unverified = checklist.filter((e) => e.status !== "verified");
        result.reasons.push(`Checklist 未完成：${unverified.length} 个 P0/P1 条目未验证（${unverified.map((e) => e.findingId).join(", ")}）`);
        result.allowed = false;
    }
    return result;
}
import { buildFailureEpisode, buildFailureEvolutionMarker, } from "./failure-sink.js";
/**
 * Map a {@link ShipGateBlockReason} onto the corresponding episode
 * outcome. Isolated so tests can pin the mapping without constructing
 * a full `FailureContext`.
 */
function outcomeForReason(reason) {
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
export function buildShipGateBlockArtifacts(topic, tier, reason, situation, now, sequenceInDay) {
    const ctx = {
        skill: "forge-ship",
        topic,
        tier,
        trigger: "ship_gate_blocked",
        situation,
    };
    const baseEpisode = buildFailureEpisode(ctx, now, sequenceInDay);
    const desiredOutcome = outcomeForReason(reason);
    const episode = baseEpisode.outcome === desiredOutcome
        ? baseEpisode
        : { ...baseEpisode, outcome: desiredOutcome };
    const markerText = buildFailureEvolutionMarker(ctx, episode.id, now);
    return { episode, markerText };
}
//# sourceMappingURL=ship.js.map