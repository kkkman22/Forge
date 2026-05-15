/**
 * Inline grill orchestration helpers — pure functions for automated
 * grill sub-process triggering from spec and decide phases.
 *
 * This module produces prompts, boolean decisions, and formatted injection
 * text. The actual inline sub-process loop is driven by the spec / decide
 * skill layer using the public grill functions from `grill.ts`.
 *
 * IO-free. No dependencies on state files or the router.
 */
// ---------------------------------------------------------------------------
// Trigger decision
// ---------------------------------------------------------------------------
export function shouldTriggerInlineGrill(input) {
    if (input.mode === "autonomous") {
        return { trigger: false, rationale: "autonomous_mode" };
    }
    if (input.alreadyTriggered[input.reason]) {
        return { trigger: false, rationale: "frequency_limit" };
    }
    return { trigger: true, rationale: input.reason };
}
// ---------------------------------------------------------------------------
// Prompt rendering
// ---------------------------------------------------------------------------
const CONFIRM_PROMPTS = {
    spec_high_ambiguity: "检测到 spec 草案存在模糊点。是否进入 grill 子流程逐项澄清？",
    decide_requirement_disagreement: "检测到需求侧存在分歧。是否进入 grill 子流程澄清需求边界？",
    decide_user_hesitation: "检测到您对决策方向多次表达犹豫。是否进入 grill 子流程帮助厘清偏好？",
};
export function renderInlineGrillConfirmPrompt(reason) {
    return CONFIRM_PROMPTS[reason];
}
const ADVISORY_TEMPLATES = {
    spec_high_ambiguity: `[Autonomous Advisory] spec_high_ambiguity detected in autonomous mode. ` +
        `Inline grill skipped. Recommend running \`/forge grill\` interactively ` +
        `after reviewing the generated spec to resolve ambiguity.`,
    decide_requirement_disagreement: `[Autonomous Advisory] decide_requirement_disagreement detected in autonomous mode. ` +
        `Inline grill skipped. Recommend running \`/forge grill\` interactively ` +
        `to resolve requirement-side disagreement between perspectives.`,
    decide_user_hesitation: `[Autonomous Advisory] decide_user_hesitation detected in autonomous mode. ` +
        `Inline grill skipped. Recommend running \`/forge grill\` interactively ` +
        `when the user is available to clarify preferences.`,
};
export function renderInlineGrillAdvisory(reason) {
    return ADVISORY_TEMPLATES[reason];
}
// ---------------------------------------------------------------------------
// Injection formatting
// ---------------------------------------------------------------------------
export function formatInlineGrillInjection(result, mode) {
    if (result.kind === "completed") {
        return [
            `[Inline Grill 对齐结果 — ${mode}]`,
            `对齐摘要：${result.alignmentSummary}`,
            "请基于以上对齐结果重新生成内容。",
        ].join("\n");
    }
    if (result.kind === "skipped") {
        return `[Inline Grill] 已跳过 (${result.reason})。保留原始内容。`;
    }
    return `[Inline Grill] 已中止（用户中途退出）。部分对齐结果已丢弃。`;
}
//# sourceMappingURL=grill-inline.js.map