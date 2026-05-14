/**
 * Branch gate — unified dispatch layer for branch-topic consistency checks.
 *
 * Wraps pure functions from branch-lifecycle.ts into a single entry point
 * used by all forge skills at their §1.5 Pre-flight step.
 *
 * Pure function — no side effects. The SKILL layer handles I/O
 * (reading git state, running checkout, persisting findings).
 */
import { checkBranchTopicGate, detectUnshippedBranches, extractBranchTopic, } from "./branch-lifecycle.js";
// ---------------------------------------------------------------------------
// Default severity mapping
// ---------------------------------------------------------------------------
export const DEFAULT_SEVERITY = {
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
export function runBranchGate(input) {
    if (input.alreadyCheckedThisPhase) {
        return { kind: "skipped", reason: "already_checked_this_phase" };
    }
    if (input.currentTask === null) {
        return { kind: "skipped", reason: "no_current_task" };
    }
    if (input.currentBranch === "main" || input.currentBranch === "master") {
        return { kind: "passed" };
    }
    const severity = input.severityOverride ?? DEFAULT_SEVERITY[input.skill];
    const gateResult = checkBranchTopicGate(input.currentBranch, input.currentTask);
    if (!gateResult.allowed) {
        const suggestedBranch = `feature/${input.currentTask}`;
        const branchTopic = extractBranchTopic(input.currentBranch);
        if (input.mode === "autonomous"
            && branchTopic !== null
            && input.isCleanTree) {
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
            reasons: unshipped.map(u => u.message),
            suggestedBranch: input.currentBranch,
        };
    }
    return { kind: "passed" };
}
// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------
export function renderBranchGatePrompt(result) {
    switch (result.kind) {
        case "passed":
        case "skipped":
            return "";
        case "blocked":
            return [
                "🚫 分支门禁阻断：",
                ...result.reasons.map(r => `  - ${r}`),
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
                ...result.reasons.map(r => `  - ${r}`),
                "",
                `建议分支：${result.suggestedBranch}`,
            ].join("\n");
        case "auto_fixed":
            return `✅ 已自动切换到 ${result.newBranch}（原分支：${result.previousBranch}）`;
    }
}
export function renderBranchGateAdvisory(result) {
    switch (result.kind) {
        case "passed":
        case "skipped":
            return "";
        case "blocked":
            return [
                "## Branch Gate Advisory (branch-gate-blocked)",
                "",
                "Branch gate blocked execution.",
                ...result.reasons.map(r => `- ${r}`),
                "",
                `Suggested branch: ${result.suggestedBranch}`,
                "Action: switch to the suggested branch and retry.",
            ].join("\n");
        case "warned":
            return [
                "## Branch Gate Advisory (branch-gate-warned)",
                "",
                ...result.reasons.map(r => `- ${r}`),
                "",
                "未交付分支 detected — consider completing their lifecycle (merge/PR/discard).",
            ].join("\n");
        case "auto_fixed":
            return `Branch gate auto-fixed: ${result.previousBranch} → ${result.newBranch}`;
    }
}
//# sourceMappingURL=branch-gate.js.map