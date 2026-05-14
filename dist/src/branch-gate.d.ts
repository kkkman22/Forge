/**
 * Branch gate — unified dispatch layer for branch-topic consistency checks.
 *
 * Wraps pure functions from branch-lifecycle.ts into a single entry point
 * used by all forge skills at their §1.5 Pre-flight step.
 *
 * Pure function — no side effects. The SKILL layer handles I/O
 * (reading git state, running checkout, persisting findings).
 */
import type { PendingDeliveryRecord } from "./loop-types.js";
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
