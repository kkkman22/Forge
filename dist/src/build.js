/**
 * Build engine — core logic extracted from forge-build/SKILL.md.
 *
 * Implements:
 *   - checkBuildGate:       Verifies Spec is locked AND Plan is approved before build
 *   - trackFixAttempts:     Tracks consecutive fix failures and triggers escalation
 *   - shouldEscalateToDebug: Determines if 3 consecutive failures have been reached
 *
 * Gate check (Property 8):
 *   Build is allowed ONLY when spec.status === "locked" AND plan.status === "approved".
 *   Any other combination → blocked with a specific reason.
 *
 * Consecutive failure escalation (Property 10):
 *   When the same fix fails 3 consecutive times → system stops and escalates to /forge debug.
 *   Fewer than 3 consecutive failures → continues normally.
 */
// ---------------------------------------------------------------------------
// Build gate check (Property 8)
// ---------------------------------------------------------------------------
/**
 * Check whether `/forge build` is allowed to proceed.
 *
 * Per SKILL.md §前置检查 and design Property 8:
 *   - Spec must be "locked"
 *   - Plan must be "approved"
 *   - Both conditions must be true simultaneously
 *
 * Returns { allowed, reasons } where reasons lists all unmet conditions.
 */
export function checkBuildGate(specStatus, planStatus) {
    const reasons = [];
    if (specStatus !== "locked") {
        reasons.push(`Spec 未锁定：当前状态为 "${specStatus}"，需要先运行 /forge spec 完成锁定`);
    }
    if (planStatus !== "approved") {
        reasons.push(`Plan 未批准：当前状态为 "${planStatus}"，需要先运行 /forge plan 获得批准`);
    }
    return {
        allowed: reasons.length === 0,
        reasons,
    };
}
// ---------------------------------------------------------------------------
// Consecutive failure escalation (Property 10)
// ---------------------------------------------------------------------------
/**
 * Analyze a sequence of fix attempts and determine if escalation is needed.
 *
 * Per SKILL.md §失败处理 and design Property 10:
 *   - 3 consecutive failures → stop and escalate to /forge debug
 *   - A success resets the consecutive failure counter
 *   - Less than 3 consecutive failures → continue
 *
 * Returns { shouldEscalate, consecutiveFailures, escalationIndex }.
 */
export function analyzeFixAttempts(sequence) {
    const ESCALATION_THRESHOLD = 3;
    let consecutiveFailures = 0;
    for (let i = 0; i < sequence.attempts.length; i++) {
        if (sequence.attempts[i] === "failure") {
            consecutiveFailures++;
            if (consecutiveFailures >= ESCALATION_THRESHOLD) {
                return {
                    shouldEscalate: true,
                    consecutiveFailures,
                    escalationIndex: i,
                };
            }
        }
        else {
            // Success resets the counter
            consecutiveFailures = 0;
        }
    }
    return {
        shouldEscalate: false,
        consecutiveFailures,
        escalationIndex: -1,
    };
}
/**
 * Convenience function: given a sequence, should we escalate to /forge debug?
 *
 * Returns true if 3 or more consecutive failures are found anywhere in the sequence.
 */
export function shouldEscalateToDebug(sequence) {
    return analyzeFixAttempts(sequence).shouldEscalate;
}
/**
 * Build one SubagentInvocation per research topic.
 *
 * Each subagent investigates a single research topic independently.
 */
export function buildResearchSubagents(topics) {
    return topics.map((topic) => ({
        agentType: "Explore",
        prompt: `研究以下主题：${topic}`,
        permissionMode: "default",
        maxTurns: 10,
    }));
}
/**
 * Merge successful research subagent outputs into a single findings document.
 *
 * All findings from every successful subagent are preserved with no loss.
 * Failed subagents are noted in the document.
 */
export function mergeResearchFindings(results) {
    const succeeded = results.filter((r) => r.status === "success" && r.output);
    const failed = results.filter((r) => r.status !== "success");
    const parts = [];
    if (failed.length > 0) {
        parts.push(`部分研究 Subagent 失败（${failed.length}/${results.length}）：`);
        for (const f of failed) {
            parts.push(`- ${f.agentType}: ${f.error ?? "unknown error"}`);
        }
    }
    for (const s of succeeded) {
        parts.push(s.output ?? "");
    }
    return parts.join("\n\n");
}
//# sourceMappingURL=build.js.map