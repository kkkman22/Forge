/**
 * Completion reporter — pure functions for formatting structured completion
 * and abort summaries at the end of a Forge Loop run.
 *
 * Extracted from SdkDriver to reduce its responsibility surface.
 * All functions are pure: they accept data and return formatted strings.
 *
 * **Validates: Requirements 9.1–9.5**
 */
import { formatPerformanceBaseline } from "./logger/index.js";
import { evaluateReviewGate } from "./quality-gate.js";
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Format a structured completion or abort summary.
 *
 * - **Normal completion**: objective, tier, total iterations, per-phase
 *   pass/fail status, branch name.
 * - **Circuit breaker abort**: unresolved P0/P1 issues list and recovery
 *   suggestions.
 * - **Error abort**: error reason and `/forge resume` suggestion.
 */
export function formatCompletionSummary(ctx, baseline) {
    const lines = [];
    if (ctx.loopCompletedNormally) {
        // --- Normal completion (Req 9.1, 9.4, 9.5) ---
        lines.push(ctx.t("driver.summary.completedTitle"));
        lines.push(ctx.t("driver.summary.objective", { objective: ctx.objective }));
        lines.push(ctx.t("driver.summary.tier", { tier: ctx.presetTier }));
        lines.push(ctx.t("driver.summary.iterations", { count: String(ctx.currentIteration) }));
        const phaseStatus = buildPhaseStatusSummary(ctx.notesDocument, ctx.t);
        if (phaseStatus.length > 0) {
            lines.push(ctx.t("driver.summary.phasesHeader"));
            for (const ps of phaseStatus) {
                lines.push(`  ${ps}`);
            }
        }
        if (ctx.branchName) {
            lines.push(ctx.t("driver.summary.branch", { branch: ctx.branchName }));
        }
    }
    else if (ctx.reviewFixAttempts >= ctx.maxConsecutiveFailures) {
        // --- Circuit breaker abort (Req 9.2) ---
        lines.push(ctx.t("driver.summary.circuitBreakerTitle"));
        lines.push(ctx.t("driver.summary.fixAttemptsExhausted", {
            attempts: String(ctx.reviewFixAttempts),
            max: String(ctx.maxConsecutiveFailures),
        }));
        const unresolvedIssues = collectUnresolvedIssues(ctx.readReviewFile);
        if (unresolvedIssues.length > 0) {
            lines.push(ctx.t("driver.summary.unresolvedIssuesHeader"));
            for (const issue of unresolvedIssues) {
                lines.push(`  ${issue}`);
            }
        }
        lines.push(ctx.t("driver.summary.recovery"));
    }
    else {
        // --- Error abort (Req 9.3) ---
        lines.push(ctx.t("driver.summary.errorTitle"));
        const lastFailure = getLastFailureReason(ctx.notesDocument);
        if (lastFailure) {
            lines.push(ctx.t("driver.summary.reason", { reason: lastFailure }));
        }
        lines.push(ctx.t("driver.summary.recovery"));
    }
    // Append performance baseline (Req 5.2).
    lines.push("");
    lines.push(formatPerformanceBaseline(baseline));
    return lines.join("\n");
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/**
 * Build per-phase pass/fail status from the notes document entries.
 *
 * Scans iteration entries for phase information embedded in summaries,
 * and aggregates pass/fail per phase.
 */
export function buildPhaseStatusSummary(notesDocument, t) {
    const phaseResults = new Map();
    for (const entry of notesDocument.entries) {
        const phaseMatch = entry.summary.match(/^(\S+)\s+phase\s+(completed|failed)/);
        if (phaseMatch) {
            const phase = phaseMatch[1];
            phaseResults.set(phase, entry.success);
        }
    }
    const result = [];
    for (const [phase, passed] of phaseResults) {
        result.push(passed
            ? t("driver.summary.phasePassed", { phase })
            : t("driver.summary.phaseFailed", { phase }));
    }
    return result;
}
/**
 * Collect unresolved P0/P1 issues from the review file.
 */
export function collectUnresolvedIssues(readReviewFile) {
    try {
        if (!readReviewFile)
            return [];
        const reviewContent = readReviewFile();
        if (!reviewContent)
            return [];
        const gateResult = evaluateReviewGate(reviewContent);
        if (gateResult.issues && gateResult.issues.length > 0) {
            return gateResult.issues
                .filter((i) => i.severity === "P0" || i.severity === "P1")
                .map((i) => `${i.severity}: ${i.description}`);
        }
    }
    catch {
        // Non-critical: return empty on any error
    }
    return [];
}
/**
 * Get the last failure reason from the notes document.
 */
export function getLastFailureReason(notesDocument) {
    for (let i = notesDocument.entries.length - 1; i >= 0; i--) {
        const entry = notesDocument.entries[i];
        if (!entry.success) {
            return entry.summary;
        }
    }
    return null;
}
//# sourceMappingURL=completion-reporter.js.map