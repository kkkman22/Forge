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
import { buildFailureEpisode, buildFailureEvolutionMarker, } from "./failure-sink.js";
/**
 * Pure helper that constructs the failure artefacts triggered by the
 * three-strike escalation path in `/forge build`.
 *
 * Behaviour (Requirement 8.6):
 *   - Builds a {@link FailureContext} with `skill = "forge-build"` and
 *     `trigger = "three_strike"`, carrying `topic`, `tier`, `situation`,
 *     and (optional) `rootCause` from the call site.
 *   - Delegates to {@link buildFailureEpisode} to produce a v2 Episode
 *     with `outcome: "failure"`, a deterministic id of the form
 *     `ep-YYYY-MM-DD-NNN`, and a body that embeds the trigger metadata.
 *   - Calls {@link buildFailureEvolutionMarker} with the episode id so
 *     the Evolution marker target is `forge-build#three_strike`.
 *
 * The helper does no IO; drivers persist the episode to
 * `.forge/knowledge/sessions/<date>-<topic>.md` and append the marker
 * to the topic's progress file. Both writes are advisory — failure to
 * persist should degrade to a warning per Requirement 8.12.
 *
 * Pure: identical `(topic, tier, situation, rootCause, now, sequenceInDay)`
 * always yields identical artefacts.
 */
export function buildThreeStrikeFailureArtifacts(topic, tier, situation, rootCause, now, sequenceInDay) {
    const ctx = {
        skill: "forge-build",
        topic,
        tier,
        trigger: "three_strike",
        situation,
    };
    if (rootCause !== undefined && rootCause.length > 0) {
        ctx.rootCause = rootCause;
    }
    const episode = buildFailureEpisode(ctx, now, sequenceInDay);
    const markerText = buildFailureEvolutionMarker(ctx, episode.id, now);
    return { episode, markerText };
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
/** Failure indicator patterns in test output. */
const FAILURE_INDICATORS = [
    "FAIL",
    "Error",
    "AssertionError",
    "expected",
    "not defined",
    "Cannot find",
];
/** Success indicator patterns. */
const SUCCESS_INDICATORS = ["passed", "PASS", "all tests passed", "Tests:.*passed"];
/**
 * Validate RED Verification Gate evidence.
 *
 * Per R9: three evidence fields must be present and actual_output must
 * contain failure indicators (not success indicators).
 */
export function validateRedGate(evidence) {
    if (!evidence.command || evidence.command.trim() === "") {
        return { valid: false, reason: "missing command field" };
    }
    if (!evidence.actual_output || evidence.actual_output.trim() === "") {
        return { valid: false, reason: "missing actual_output field" };
    }
    if (!evidence.expected_failure_reason || evidence.expected_failure_reason.trim() === "") {
        return { valid: false, reason: "missing expected_failure_reason field" };
    }
    // Check if output indicates test PASSED
    const _outputLower = evidence.actual_output.toLowerCase();
    for (const _indicator of SUCCESS_INDICATORS) {
        if (/passed/i.test(evidence.actual_output) && !/failed/i.test(evidence.actual_output)) {
            return {
                valid: false,
                reason: "RED test PASSED — test may not assert missing behavior. Rewrite the test.",
            };
        }
    }
    // Check if output contains at least one failure indicator
    const hasFailureIndicator = FAILURE_INDICATORS.some((ind) => evidence.actual_output.includes(ind));
    if (!hasFailureIndicator) {
        return {
            valid: false,
            reason: "actual_output does not contain failure indicators (FAIL/Error/AssertionError)",
        };
    }
    return { valid: true };
}
/**
 * Compare actual command output against an Expected specification.
 *
 * Three legal forms:
 *   - `exit <N>` — match exit code
 *   - `output contains "<string>"` — substring match in output
 *   - `FAIL -- "<reason>"` — reason substring must appear in output
 */
export function compareExpectedOutput(spec) {
    const { expected, actual } = spec;
    const trimmed = expected.trim();
    // Form 1: exit code
    const exitMatch = /^exit\s+(\d+)$/.exec(trimmed);
    if (exitMatch) {
        const expectedCode = Number.parseInt(exitMatch[1], 10);
        const match = actual.exitCode === expectedCode;
        return {
            match,
            detail: match ? undefined : `expected exit ${expectedCode}, got ${actual.exitCode}`,
        };
    }
    // Form 2: substring match
    const containsMatch = /^output\s+contains\s+"(.+)"$/.exec(trimmed);
    if (containsMatch) {
        const needle = containsMatch[1];
        const match = actual.output.includes(needle);
        return { match, detail: match ? undefined : `output does not contain "${needle}"` };
    }
    // Form 3: fail reason
    const failMatch = /^FAIL\s+--\s+"(.+)"$/.exec(trimmed);
    if (failMatch) {
        const reason = failMatch[1];
        const match = actual.exitCode !== 0 && actual.output.includes(reason);
        return {
            match,
            detail: match
                ? undefined
                : `output does not contain "${reason}" and exit code is ${actual.exitCode}`,
        };
    }
    return { match: false, detail: `unrecognized Expected format: "${trimmed}"` };
}
// ---------------------------------------------------------------------------
// Micro-Review Integration (Sprint 2 — R9)
// ---------------------------------------------------------------------------
import { runMicroReview, } from "./build-micro-review.js";
/**
 * Run post-verification Micro-Review for a completed atomic task.
 *
 * Wrapper around {@link runMicroReview} that the build SKILL calls
 * after each task's Verify GREEN step. Returns the raw result for
 * the SKILL to decide on iteration.
 *
 * @example
 * ```ts
 * const result = runTaskPostVerification({ task, gitDiff, verifyOutput, planVersion: "v1" });
 * if (result.verdict === "needs_iteration") { /* loop back *\/ }
 * ```
 * @public
 */
export function runTaskPostVerification(input) {
    return runMicroReview(input);
}
//# sourceMappingURL=build.js.map