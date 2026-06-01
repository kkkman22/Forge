/**
 * Build engine — core logic extracted from forge-build/SKILL.md.
 *
 * Implements:
 *   - checkBuildGate:       Verifies Spec is locked AND Plan is approved before build
 *   - trackFixAttempts:     Tracks consecutive fix failures and triggers escalation
 *   - shouldEscalateToDebug: Determines if 3 consecutive failures have been reached
 *   - scheduleWave:         Execute wave tasks in parallel with 429 degradation
 *   - buildThreeStrikeDebugReroute: §2.4 three-strike with fail_signature + debug template
 *
 * Gate check (Property 8):
 *   Build is allowed ONLY when spec.status === "locked" AND plan.status === "approved".
 *   Any other combination → blocked with a specific reason.
 *
 * Consecutive failure escalation (Property 10):
 *   When the same fix fails 3 consecutive times → system stops and escalates to /forge debug.
 *   Fewer than 3 consecutive failures → continues normally.
 */
import type { Wave } from "./spec-bundle.js";
import type { FixFailure, ThreeStrikeResult } from "./spec-pbt-derivation.js";
export type { TaskSeed, Wave } from "./spec-bundle.js";
export type { FixFailure, ThreeStrikeResult } from "./spec-pbt-derivation.js";
export { computeFailSignature, triggerThreeStrikeReroute } from "./spec-pbt-derivation.js";
export { parseWaves } from "./spec-wave.js";
export type SpecStatus = "draft" | "locked";
export type PlanStatus = "draft" | "approved";
export interface BuildGateResult {
    allowed: boolean;
    reasons: string[];
}
export type FixAttemptResult = "success" | "failure";
export interface FixAttemptSequence {
    attempts: FixAttemptResult[];
}
export interface EscalationResult {
    shouldEscalate: boolean;
    consecutiveFailures: number;
    /** Index in the sequence where escalation is first triggered (0-based), or -1 if no escalation. */
    escalationIndex: number;
}
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
export declare function checkBuildGate(specStatus: SpecStatus, planStatus: PlanStatus): BuildGateResult;
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
export declare function analyzeFixAttempts(sequence: FixAttemptSequence): EscalationResult;
/**
 * Convenience function: given a sequence, should we escalate to /forge debug?
 *
 * Returns true if 3 or more consecutive failures are found anywhere in the sequence.
 */
export declare function shouldEscalateToDebug(sequence: FixAttemptSequence): boolean;
import type { Episode, EpisodeTier } from "./episode.js";
/** Output of {@link buildThreeStrikeFailureArtifacts}. */
export interface ThreeStrikeFailureArtifacts {
    episode: Episode;
    markerText: string;
}
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
export declare function buildThreeStrikeFailureArtifacts(topic: string, tier: EpisodeTier, situation: string, rootCause: string | undefined, now: Date, sequenceInDay: number): ThreeStrikeFailureArtifacts;
import type { SubagentInvocation, SubagentResult } from "./types.js";
/**
 * Build one SubagentInvocation per research topic.
 *
 * Each subagent investigates a single research topic independently.
 */
export declare function buildResearchSubagents(topics: string[]): SubagentInvocation[];
/**
 * Merge successful research subagent outputs into a single findings document.
 *
 * All findings from every successful subagent are preserved with no loss.
 * Failed subagents are noted in the document.
 */
export declare function mergeResearchFindings(results: SubagentResult[]): string;
export interface ScheduleWaveOptions {
    maxConcurrency: number;
    executor: (taskId: string) => Promise<boolean>;
    onHttp429?: () => void;
}
export interface ScheduleWaveResult {
    completed: string[];
    failed: string[];
    degraded429: boolean;
}
/**
 * Execute tasks in a single wave with concurrency control and 429 degradation.
 *
 * Degradation staircase: maxConcurrency → floor(max/2) → 2 → 1 (serial).
 */
export declare function scheduleWave(wave: Wave, options: ScheduleWaveOptions): Promise<ScheduleWaveResult>;
export interface ThreeStrikeDebugRerouteResult extends ThreeStrikeResult {
    debugFilePath: string;
}
/**
 * Build three-strike debug reroute decision and write diagnostic template.
 *
 * Calls triggerThreeStrikeReroute to compute fail_signature and reroute decision.
 * If reroute === true, writes diagnostic template to .forge/debug/<topic>.md.
 */
export declare function buildThreeStrikeDebugReroute(history: FixFailure[], currentFailure: FixFailure, debugDir: string, topic: string): ThreeStrikeDebugRerouteResult;
/** Evidence fields required after RED phase before GREEN transition. */
export interface RedGateEvidence {
    /** The exact command that was run. */
    command: string;
    /** First 10 lines of actual output. */
    actual_output: string;
    /** Why the test should fail (e.g. "function not defined"). */
    expected_failure_reason: string;
}
/** Result of RED gate validation. */
export interface RedGateResult {
    valid: boolean;
    reason?: string;
}
/**
 * Validate RED Verification Gate evidence.
 *
 * Per R9: three evidence fields must be present and actual_output must
 * contain failure indicators (not success indicators).
 */
export declare function validateRedGate(evidence: RedGateEvidence): RedGateResult;
/** Actual output from a command execution. */
export interface ActualOutput {
    exitCode: number;
    output: string;
}
/** An Expected Output specification to compare against. */
export interface ExpectedSpec {
    expected: string;
    actual: ActualOutput;
}
/** Result of expected output comparison. */
export interface ExpectedComparisonResult {
    match: boolean;
    detail?: string;
}
/**
 * Compare actual command output against an Expected specification.
 *
 * Three legal forms:
 *   - `exit <N>` — match exit code
 *   - `output contains "<string>"` — substring match in output
 *   - `FAIL -- "<reason>"` — reason substring must appear in output
 */
export declare function compareExpectedOutput(spec: ExpectedSpec): ExpectedComparisonResult;
import { type MicroReviewInput, type MicroReviewResult } from "./build-micro-review.js";
export type { MicroReviewInput, MicroReviewResult };
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
export declare function runTaskPostVerification(input: MicroReviewInput): MicroReviewResult;
