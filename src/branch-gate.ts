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

// ---------------------------------------------------------------------------
// Inlined pure functions (originally from branch-lifecycle.ts, Wave 3 merge)
// ---------------------------------------------------------------------------

/** Extract topic from a feature/forge branch name. */
export function extractBranchTopic(branchName: string): string | null {
  const match = branchName.match(/^(?:feature|forge)\/(.+)$/);
  return match ? match[1] : null;
}

/** Check whether the branch topic matches the task topic. */
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

export interface UnshippedBranchWarning {
  branchName: string;
  topic: string;
  timestamp: number;
  message: string;
}

/** Detect pending deliveries for topics other than the current one. */
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BranchGateSkill = "plan" | "build" | "review" | "test" | "ship" | "debug" | "learn";

export type BranchGateMode = "autonomous" | "interactive";

export type BranchGateSeverity = "block" | "warn";

export type BranchGateResult =
  | { kind: "passed" }
  | { kind: "skipped"; reason: "already_checked_this_phase" | "no_current_task" }
  | { kind: "blocked"; reasons: string[]; suggestedBranch: string }
  | { kind: "warned"; reasons: string[]; suggestedBranch: string }
  | { kind: "auto_fixed"; previousBranch: string; newBranch: string };

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

// ---------------------------------------------------------------------------
// Default severity mapping
// ---------------------------------------------------------------------------

export const DEFAULT_SEVERITY: Record<BranchGateSkill, BranchGateSeverity> = {
  plan: "warn",
  build: "block",
  review: "block",
  test: "block",
  ship: "block",
  debug: "warn",
  learn: "warn",
};

// ---------------------------------------------------------------------------
// Core dispatch
// ---------------------------------------------------------------------------

const SAFE_TASK_RE = /^[a-zA-Z0-9_-]+$/;

export function runBranchGate(input: BranchGateInput): BranchGateResult {
  if (input.alreadyCheckedThisPhase) {
    return { kind: "skipped", reason: "already_checked_this_phase" };
  }

  if (input.currentTask === null) {
    return { kind: "skipped", reason: "no_current_task" };
  }

  if (!SAFE_TASK_RE.test(input.currentTask)) {
    return {
      kind: "blocked",
      reasons: [`任务名 "${input.currentTask}" 包含不安全字符，仅允许 [a-zA-Z0-9_-]`],
      suggestedBranch: "feature/<valid-topic>",
    };
  }

  if (input.currentBranch === "main" || input.currentBranch === "master") {
    return { kind: "passed" };
  }

  const severity = input.severityOverride ?? DEFAULT_SEVERITY[input.skill];
  const gateResult = checkBranchTopicGate(input.currentBranch, input.currentTask);

  if (!gateResult.allowed) {
    const suggestedBranch = `feature/${input.currentTask}`;
    const branchTopic = extractBranchTopic(input.currentBranch);

    if (input.mode === "autonomous" && branchTopic !== null && input.isCleanTree) {
      return {
        kind: "auto_fixed",
        previousBranch: input.currentBranch,
        newBranch: suggestedBranch,
      };
    }

    if (severity === "block") {
      return { kind: "blocked", reasons: gateResult.reasons, suggestedBranch };
    }
    return { kind: "warned", reasons: gateResult.reasons, suggestedBranch };
  }

  const unshipped = detectUnshippedBranches(input.pendingDeliveries, input.currentTask);
  if (unshipped.length > 0) {
    return {
      kind: "warned",
      reasons: unshipped.map((u) => u.message),
      suggestedBranch: input.currentBranch,
    };
  }

  return { kind: "passed" };
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

export function renderBranchGatePrompt(result: BranchGateResult): string {
  switch (result.kind) {
    case "passed":
    case "skipped":
      return "";
    case "blocked":
      return [
        "🚫 分支门禁阻断：",
        ...result.reasons.map((r) => `  - ${r}`),
        "",
        `建议分支：${result.suggestedBranch}`,
        "",
        "选项：",
        `  1. 切换到 ${result.suggestedBranch}`,
        "  2. 强制继续（覆盖严重度）",
        "  3. 中止 skill",
      ].join("\n");
    case "warned":
      return [
        "⚠️ 分支门禁警告：",
        ...result.reasons.map((r) => `  - ${r}`),
        "",
        `建议分支：${result.suggestedBranch}`,
      ].join("\n");
    case "auto_fixed":
      return `✅ 已自动切换到 ${result.newBranch}（原分支：${result.previousBranch}）`;
  }
}

export function renderBranchGateAdvisory(result: BranchGateResult): string {
  switch (result.kind) {
    case "passed":
    case "skipped":
      return "";
    case "blocked":
      return [
        "## Branch Gate Advisory (branch-gate-blocked)",
        "",
        "Branch gate blocked execution.",
        ...result.reasons.map((r) => `- ${r}`),
        "",
        `Suggested branch: ${result.suggestedBranch}`,
        "Action: switch to the suggested branch and retry.",
      ].join("\n");
    case "warned":
      return [
        "## Branch Gate Advisory (branch-gate-warned)",
        "",
        ...result.reasons.map((r) => `- ${r}`),
        "",
        "未交付分支 detected — consider completing their lifecycle (merge/PR/discard).",
      ].join("\n");
    case "auto_fixed":
      return `Branch gate auto-fixed: ${result.previousBranch} → ${result.newBranch}`;
  }
}
