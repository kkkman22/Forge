/**
 * Branch gate — unified dispatch layer for branch-topic consistency checks.
 *
 * Self-contained pure functions for branch topic extraction, gate checking,
 * and unshipped branch detection. Used by all forge skills at their §1.5
 * Pre-flight step.
 *
 * Pure function — no side effects. The SKILL layer handles I/O
 * (reading git state, running checkout, persisting findings).
 */
import type { BranchTopicGateResult, PendingDeliveryRecord } from "./types.js";
/** Extract topic from a feature/forge branch name. */
export declare function extractBranchTopic(branchName: string): string | null;
/** Check whether the branch topic matches the task topic. */
export declare function checkBranchTopicGate(branchName: string, taskTopic: string): BranchTopicGateResult;
interface UnshippedBranchWarning {
    branchName: string;
    topic: string;
    timestamp: number;
    message: string;
}
/** Detect pending deliveries for topics other than the current one. */
export declare function detectUnshippedBranches(pendingDeliveries: PendingDeliveryRecord[], currentTopic: string): UnshippedBranchWarning[];
export type BranchGateSkill = "plan" | "build" | "review" | "test" | "ship" | "debug" | "learn";
export type BranchGateMode = "autonomous" | "interactive";
export type BranchGateSeverity = "block" | "warn";
export type BranchGateResult = {
    kind: "passed";
} | {
    kind: "skipped";
    reason: "already_checked_this_phase" | "no_current_task";
} | {
    kind: "blocked";
    reasons: string[];
    suggestedBranch: string;
} | {
    kind: "warned";
    reasons: string[];
    suggestedBranch: string;
} | {
    kind: "auto_fixed";
    previousBranch: string;
    newBranch: string;
};
export interface BranchGateInput {
    skill: BranchGateSkill;
    mode: BranchGateMode;
    currentBranch: string;
    currentTask: string | null;
    pendingDeliveries: PendingDeliveryRecord[];
    alreadyCheckedThisPhase: boolean;
    isCleanTree: boolean;
    severityOverride?: BranchGateSeverity;
}
export declare const DEFAULT_SEVERITY: Record<BranchGateSkill, BranchGateSeverity>;
export declare function runBranchGate(input: BranchGateInput): BranchGateResult;
export declare function renderBranchGatePrompt(result: BranchGateResult): string;
export declare function renderBranchGateAdvisory(result: BranchGateResult): string;
export {};
