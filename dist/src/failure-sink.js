/**
 * Failure auto-sink — pure functions that turn a runtime failure
 * context into two artefacts:
 *
 *   1. A structured {@link Episode} with `outcome: "failure"`, ready
 *      to be appended to `.forge/knowledge/sessions/<date>-<topic>.md`
 *      by a driver.
 *   2. An Evolution marker string targeting the responsible skill,
 *      suitable for appending to a reviews / progress / findings file
 *      so the learn skill can aggregate it later.
 *
 * The module is IO-free. Drivers that persist these artefacts handle
 * writes and downgrade any failure to `console.warn` per Requirement
 * 8.12 ("write failures degrade to warnings").
 *
 * **Validates: Requirements 8.6, 8.7**
 */
import { generateEpisodeId } from "./episode.js";
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/**
 * Render an ISO date (YYYY-MM-DD) from a `Date`. We intentionally slice
 * the ISO string rather than format locally so UTC is used everywhere
 * and tests can inject a fixed clock without timezone drift.
 */
function isoDate(now) {
    return now.toISOString().slice(0, 10);
}
/**
 * Per-trigger human-readable lesson text, used as the `lesson` field
 * and as a short reminder embedded in the Evolution marker description.
 * Keeping the text here (and not in the driver) ensures the same
 * phrasing appears across episode body and marker, so humans reading
 * `evolution-report.md` can quickly correlate the two.
 */
function lessonFor(trigger) {
    switch (trigger) {
        case "three_strike":
            return "三次连续失败提示任务或方法需要重新审视";
        case "new_review_pattern":
            return "review 发现了尚未沉淀的新问题模式，值得补入知识库";
        case "ship_gate_blocked":
            return "交付门禁拦截需要在流程或检查清单中修补漏洞";
        case "debug_resolved":
            return "调试虽已结束，记录根因模式以便后续识别相同症状";
        case "grill_abandoned":
            return "需求澄清中止，未完成边界对齐——后续返工风险升高";
        case "test_layer_failed":
            return "测试 layer 失败暴露代码与 spec 之间的偏差，值得作为模式沉淀";
        case "conflict_validation_failed":
            return "冲突解决后验证未通过，提示合并策略或测试覆盖不足";
        case "loop_circuit_broken":
            return "Forge Loop 熔断暴露循环目标可能不可达或方法未收敛";
    }
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Build a structured `Episode` representing a failure captured at a
 * skill boundary.
 *
 * Fields are populated as follows:
 *   - `schema_version`    always `2`.
 *   - `id`                `ep-YYYY-MM-DD-NNN` via {@link generateEpisodeId}.
 *   - `date`              UTC date from `now`.
 *   - `skill` / `tier`    copied from `ctx`.
 *   - `situation`         copied from `ctx.situation`.
 *   - `root_cause`        set only when `ctx.rootCause` is non-empty.
 *   - `lesson`            the trigger-specific lesson text.
 *   - `outcome`           always `"failure"`.
 *   - `body`              a short markdown block recording the
 *                         trigger, topic, tier, and (optional) root
 *                         cause so the episode renders as a
 *                         self-contained post-mortem stub.
 *
 * Pure function: same `(ctx, now, sequenceInDay)` always produces the
 * same Episode.
 *
 * @internal
 */
export function buildFailureEpisode(ctx, now, sequenceInDay) {
    const date = isoDate(now);
    const id = generateEpisodeId(date, sequenceInDay);
    const bodyLines = [
        "",
        "## 摘要",
        `- trigger: ${ctx.trigger}`,
        `- topic: ${ctx.topic}`,
        `- tier: ${ctx.tier}`,
        `- situation: ${ctx.situation}`,
    ];
    if (ctx.rootCause !== undefined && ctx.rootCause.length > 0) {
        bodyLines.push(`- root_cause: ${ctx.rootCause}`);
    }
    bodyLines.push("");
    const episode = {
        schema_version: 2,
        id,
        date,
        skill: ctx.skill,
        tier: ctx.tier,
        situation: ctx.situation,
        lesson: lessonFor(ctx.trigger),
        outcome: "failure",
        body: bodyLines.join("\n"),
    };
    if (ctx.rootCause !== undefined && ctx.rootCause.length > 0) {
        episode.root_cause = ctx.rootCause;
    }
    return episode;
}
/**
 * Render the Evolution marker string that should be appended to a
 * reviews / progress / findings file when a failure is auto-sunk.
 *
 * Format (matches the grammar parsed by `evolution-marker.ts`):
 *
 * ```
 * <!-- Evolution: YYYY-MM-DD | source: <episodeId> | target: <skill>#<trigger> -->
 * <ctx.situation>
 * ```
 *
 * `target` always carries a `#<trigger>` section qualifier so the
 * aggregation step can group markers by trigger and suggest ADRs once
 * the same section accumulates ≥3 pointers.
 *
 * The returned string ends with a trailing newline so callers can
 * concatenate it directly onto an existing file without tracking
 * separators.
 *
 * @internal
 */
export function buildFailureEvolutionMarker(ctx, episodeId, now) {
    const date = isoDate(now);
    return [
        `<!-- Evolution: ${date} | source: ${episodeId} | target: ${ctx.skill}#${ctx.trigger} -->`,
        ctx.situation,
        "",
    ].join("\n");
}
//# sourceMappingURL=failure-sink.js.map