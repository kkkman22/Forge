/**
 * Branch lifecycle enforcement — pure functions for branch-topic matching,
 * pending-delivery tracking, staleness detection, and cross-topic prevention.
 *
 * All functions are pure (no side effects). The SKILL layer is responsible
 * for I/O (reading git state, persisting records, prompting the user).
 *
 * **Validates: Requirements 1.1–1.5, 2.1–2.5, 3.1–3.7**
 */

import type {
  BranchTopicGateResult,
  CommitTopicCheckResult,
  PendingDeliveryRecord,
  UnshippedBranchWarning,
} from "./loop-types.js";

// ---------------------------------------------------------------------------
// extractBranchTopic (Property 6)
// ---------------------------------------------------------------------------

/**
 * Extract the topic segment from a `feature/<topic>` or `forge/<topic>` branch.
 * Returns `null` for branches that don't match the expected format.
 * @internal
 */
export function extractBranchTopic(branchName: string): string | null {
  const match = branchName.match(/^(?:feature|forge)\/(.+)$/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// checkBranchTopicGate (Property 1)
// ---------------------------------------------------------------------------

/**
 * Check whether the branch topic matches the task topic.
 * Returns `{ allowed, reasons }` similar to `checkBuildGate`.
 * @internal
 */
export function checkBranchTopicGate(branchName: string, taskTopic: string): BranchTopicGateResult {
  const branchTopic = extractBranchTopic(branchName);

  if (branchTopic === null) {
    return {
      allowed: false,
      reasons: [`分支 "${branchName}" 不符合 feature/<topic> 或 forge/<topic> 格式`],
    };
  }

  if (branchTopic !== taskTopic) {
    return {
      allowed: false,
      reasons: [`分支 topic "${branchTopic}" 与任务 topic "${taskTopic}" 不匹配`],
    };
  }

  return { allowed: true, reasons: [] };
}

// ---------------------------------------------------------------------------
// recordPendingDelivery (Property 3)
// ---------------------------------------------------------------------------

/**
 * Create a pending-delivery record when "keep branch" is selected in ship.
 * @internal
 */
export function recordPendingDelivery(
  branchName: string,
  topic: string,
  timestamp: number,
): PendingDeliveryRecord {
  return { branchName, topic, timestamp };
}

// ---------------------------------------------------------------------------
// detectStaleBranches (Property 4)
// ---------------------------------------------------------------------------

/**
 * Identify stale branches from the pending-delivery list.
 * A branch is stale when its topic differs from the current task topic
 * and its timestamp is older than the staleness threshold.
 * Default threshold: 0 (any pending delivery for a different topic is flagged).
 * @internal
 */
export function detectStaleBranches(
  pendingDeliveries: PendingDeliveryRecord[],
  currentTopic: string,
  currentTime: number,
  thresholdMs = 0,
): PendingDeliveryRecord[] {
  return pendingDeliveries.filter(
    (d) => d.topic !== currentTopic && currentTime - d.timestamp >= thresholdMs,
  );
}

// ---------------------------------------------------------------------------
// checkCommitTopicMatch (Property 5)
// ---------------------------------------------------------------------------

/**
 * Verify a commit's topic matches the branch's topic.
 * Returns `{ allowed: false, reason }` on mismatch.
 * @internal
 */
export function checkCommitTopicMatch(
  branchName: string,
  commitTopic: string,
): CommitTopicCheckResult {
  const branchTopic = extractBranchTopic(branchName);

  if (branchTopic === null) {
    return {
      allowed: false,
      reason: `分支 "${branchName}" 不符合 feature/<topic> 或 forge/<topic> 格式，无法验证 topic`,
    };
  }

  if (branchTopic !== commitTopic) {
    return {
      allowed: false,
      reason: `提交 topic "${commitTopic}" 与分支 topic "${branchTopic}" 不匹配`,
    };
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// detectUnshippedBranches
// ---------------------------------------------------------------------------

/**
 * Identify branches with pending deliveries that should be surfaced as
 * warnings at build start.
 * @internal
 */
export function detectUnshippedBranches(
  pendingDeliveries: PendingDeliveryRecord[],
  currentTopic: string,
): UnshippedBranchWarning[] {
  return pendingDeliveries
    .filter((d) => d.topic !== currentTopic)
    .map((d) => ({
      branchName: d.branchName,
      topic: d.topic,
      timestamp: d.timestamp,
      message: `分支 "${d.branchName}" (topic: ${d.topic}) 有未完成的交付记录，建议完成生命周期（merge/PR/discard）`,
    }));
}
