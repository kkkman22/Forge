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
//# sourceMappingURL=build.js.map