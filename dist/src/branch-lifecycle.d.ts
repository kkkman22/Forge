/**
 * Branch lifecycle enforcement — pure functions for branch-topic matching,
 * pending-delivery tracking, staleness detection, and cross-topic prevention.
 *
 * All functions are pure (no side effects). The SKILL layer is responsible
 * for I/O (reading git state, persisting records, prompting the user).
 *
 * **Validates: Requirements 1.1–1.5, 2.1–2.5, 3.1–3.7**
 */
import type { BranchTopicGateResult, CommitTopicCheckResult, PendingDeliveryRecord, UnshippedBranchWarning } from "./loop-types.js";
/**
 * Extract the topic segment from a `feature/<topic>` or `forge/<topic>` branch.
 * Returns `null` for branches that don't match the expected format.
 */
export declare function extractBranchTopic(branchName: string): string | null;
/**
 * Check whether the branch topic matches the task topic.
 * Returns `{ allowed, reasons }` similar to `checkBuildGate`.
 */
export declare function checkBranchTopicGate(branchName: string, taskTopic: string): BranchTopicGateResult;
/**
 * Create a pending-delivery record when "keep branch" is selected in ship.
 */
export declare function recordPendingDelivery(branchName: string, topic: string, timestamp: number): PendingDeliveryRecord;
/**
 * Identify stale branches from the pending-delivery list.
 * A branch is stale when its topic differs from the current task topic
 * and its timestamp is older than the staleness threshold.
 * Default threshold: 0 (any pending delivery for a different topic is flagged).
 */
export declare function detectStaleBranches(pendingDeliveries: PendingDeliveryRecord[], currentTopic: string, currentTime: number, thresholdMs?: number): PendingDeliveryRecord[];
/**
 * Verify a commit's topic matches the branch's topic.
 * Returns `{ allowed: false, reason }` on mismatch.
 */
export declare function checkCommitTopicMatch(branchName: string, commitTopic: string): CommitTopicCheckResult;
/**
 * Identify branches with pending deliveries that should be surfaced as
 * warnings at build start.
 */
export declare function detectUnshippedBranches(pendingDeliveries: PendingDeliveryRecord[], currentTopic: string): UnshippedBranchWarning[];
