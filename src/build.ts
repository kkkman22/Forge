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
 *   When the same fix fails 3 consecutive times → system stops and escalates to /tinkerman debug.
 *   Fewer than 3 consecutive failures → continues normally.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Wave } from "./spec-bundle.js";
import type { FixFailure, ThreeStrikeResult } from "./spec-pbt-derivation.js";
import { computeFailSignature, triggerThreeStrikeReroute } from "./spec-pbt-derivation.js";

export type { TaskSeed, Wave } from "./spec-bundle.js";
export type { FixFailure, ThreeStrikeResult } from "./spec-pbt-derivation.js";
export { computeFailSignature, triggerThreeStrikeReroute } from "./spec-pbt-derivation.js";
export { parseWaves } from "./spec-wave.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Build gate check (Property 8)
// ---------------------------------------------------------------------------

/**
 * Check whether `/tinkerman build` is allowed to proceed.
 *
 * Per SKILL.md §前置检查 and design Property 8:
 *   - Spec must be "locked"
 *   - Plan must be "approved"
 *   - Both conditions must be true simultaneously
 *
 * Returns { allowed, reasons } where reasons lists all unmet conditions.
 */
export function checkBuildGate(specStatus: SpecStatus, planStatus: PlanStatus): BuildGateResult {
  const reasons: string[] = [];

  if (specStatus !== "locked") {
    reasons.push(`Spec 未锁定：当前状态为 "${specStatus}"，需要先运行 /tinkerman spec 完成锁定`);
  }

  if (planStatus !== "approved") {
    reasons.push(`Plan 未批准：当前状态为 "${planStatus}"，需要先运行 /tinkerman plan 获得批准`);
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
 *   - 3 consecutive failures → stop and escalate to /tinkerman debug
 *   - A success resets the consecutive failure counter
 *   - Less than 3 consecutive failures → continue
 *
 * Returns { shouldEscalate, consecutiveFailures, escalationIndex }.
 */
export function analyzeFixAttempts(sequence: FixAttemptSequence): EscalationResult {
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
    } else {
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
 * Convenience function: given a sequence, should we escalate to /tinkerman debug?
 *
 * Returns true if 3 or more consecutive failures are found anywhere in the sequence.
 */
export function shouldEscalateToDebug(sequence: FixAttemptSequence): boolean {
  return analyzeFixAttempts(sequence).shouldEscalate;
}

// ---------------------------------------------------------------------------
// Evolution artefact helpers (skills-cross-pollination — Requirement 8.6)
// ---------------------------------------------------------------------------

import type { Episode, EpisodeTier } from "./episode.js";
import {
  buildFailureEpisode,
  buildFailureEvolutionMarker,
  type FailureContext,
} from "./failure-sink.js";

/** Output of {@link buildThreeStrikeFailureArtifacts}. */
export interface ThreeStrikeFailureArtifacts {
  episode: Episode;
  markerText: string;
}

/**
 * Pure helper that constructs the failure artefacts triggered by the
 * three-strike escalation path in `/tinkerman build`.
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
export function buildThreeStrikeFailureArtifacts(
  topic: string,
  tier: EpisodeTier,
  situation: string,
  rootCause: string | undefined,
  now: Date,
  sequenceInDay: number,
): ThreeStrikeFailureArtifacts {
  const ctx: FailureContext = {
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

// ---------------------------------------------------------------------------
// Subagent orchestration (Agent Team Migration — R3, R7)
// ---------------------------------------------------------------------------

import type { SubagentInvocation, SubagentResult } from "./types.js";

/**
 * Build one SubagentInvocation per research topic.
 *
 * Each subagent investigates a single research topic independently.
 */
export function buildResearchSubagents(topics: string[]): SubagentInvocation[] {
  return topics.map((topic) => ({
    agentType: "Explore",
    prompt: `研究以下主题：${topic}`,
    permissionMode: "default" as const,
    maxTurns: 10,
  }));
}

/**
 * Merge successful research subagent outputs into a single findings document.
 *
 * All findings from every successful subagent are preserved with no loss.
 * Failed subagents are noted in the document.
 */
export function mergeResearchFindings(results: SubagentResult[]): string {
  const succeeded = results.filter((r) => r.status === "success" && r.output);
  const failed = results.filter((r) => r.status !== "success");

  const parts: string[] = [];

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

// ---------------------------------------------------------------------------
// Wave orchestration (Requirement 4 — T-18)
// ---------------------------------------------------------------------------

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
export async function scheduleWave(
  wave: Wave,
  options: ScheduleWaveOptions,
): Promise<ScheduleWaveResult> {
  const completed: string[] = [];
  const failed: string[] = [];
  let degraded429 = false;
  let concurrency = options.maxConcurrency;

  const remaining = [...wave.tasks];

  while (remaining.length > 0) {
    const batch = remaining.splice(0, concurrency);
    const results = await Promise.allSettled(batch.map((id) => options.executor(id)));

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled" && r.value) {
        completed.push(batch[i]);
      } else {
        failed.push(batch[i]);
      }
    }

    // Check for 429 signal
    if (options.onHttp429) {
      options.onHttp429();
      degraded429 = true;
      // Degrade: max → floor(max/2) → 2 → 1
      if (concurrency > 2) {
        concurrency = Math.floor(concurrency / 2);
      } else {
        concurrency = 1;
      }
    }
  }

  return { completed, failed, degraded429 };
}

// ---------------------------------------------------------------------------
// §2.4 Three-strike debug reroute (Requirement 15 — T-25)
// ---------------------------------------------------------------------------

export interface ThreeStrikeDebugRerouteResult extends ThreeStrikeResult {
  debugFilePath: string;
}

/**
 * Build three-strike debug reroute decision and write diagnostic template.
 *
 * Calls triggerThreeStrikeReroute to compute fail_signature and reroute decision.
 * If reroute === true, writes diagnostic template to .forge/debug/<topic>.md.
 */
export function buildThreeStrikeDebugReroute(
  history: FixFailure[],
  currentFailure: FixFailure,
  debugDir: string,
  topic: string,
): ThreeStrikeDebugRerouteResult {
  const result = triggerThreeStrikeReroute(history, currentFailure);
  const debugFilePath = join(debugDir, `${topic}.md`);

  if (result.reroute) {
    try {
      if (!existsSync(debugDir)) {
        mkdirSync(debugDir, { recursive: true });
      }
      const sig = computeFailSignature([...history, currentFailure]);
      const template = `# Debug: ${topic}

**fail_signature**: ${sig}
**failures**: ${result.failures.length}
**triggered_at**: ${new Date().toISOString()}

## Diagnosis

(To be filled by /tinkerman debug agent)

## Root Cause

(Pending)

## Fix Strategy

(Pending)
`;
      writeFileSync(debugFilePath, template, "utf-8");
    } catch (_err: unknown) {
      // Best-effort write — never block reroute
    }
  }

  return { ...result, debugFilePath };
}

// ---------------------------------------------------------------------------
// RED Verification Gate (Pack System — R9)
// ---------------------------------------------------------------------------

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
export function validateRedGate(evidence: RedGateEvidence): RedGateResult {
  if (!evidence.command || evidence.command.trim() === "") {
    return { valid: false, reason: "missing command field" };
  }
  if (!evidence.actual_output || evidence.actual_output.trim() === "") {
    return { valid: false, reason: "missing actual_output field" };
  }
  if (!evidence.expected_failure_reason || evidence.expected_failure_reason.trim() === "") {
    return { valid: false, reason: "missing expected_failure_reason field" };
  }

  // Check if output indicates test PASSED. SUCCESS_INDICATORS are matched as
  // case-insensitive regexes (REQ-02 audit-remediate-0619): previously the
  // for-loop body only ran a hardcoded `/passed/i`, leaving patterns like
  // "PASS" or "Tests:.*passed" unused. A success signal present alongside
  // failure-y noise (e.g. "PASS  Error fetching telemetry") still means the
  // test went green → RED evidence is invalid.
  const hasSuccessIndicator = SUCCESS_INDICATORS.some((ind) =>
    new RegExp(ind, "i").test(evidence.actual_output),
  );
  const hasFailKeyword = /failed/i.test(evidence.actual_output);
  if (hasSuccessIndicator && !hasFailKeyword) {
    return {
      valid: false,
      reason: "RED test PASSED — test may not assert missing behavior. Rewrite the test.",
    };
  }

  // Check if output contains at least one failure indicator
  const hasFailureIndicator = FAILURE_INDICATORS.some((ind) =>
    evidence.actual_output.includes(ind),
  );

  if (!hasFailureIndicator) {
    return {
      valid: false,
      reason: "actual_output does not contain failure indicators (FAIL/Error/AssertionError)",
    };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Expected Output comparison (Pack System — R10.5)
// ---------------------------------------------------------------------------

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
export function compareExpectedOutput(spec: ExpectedSpec): ExpectedComparisonResult {
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

import {
  type MicroReviewInput,
  type MicroReviewResult,
  runMicroReview,
} from "./build-micro-review.js";

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
export function runTaskPostVerification(input: MicroReviewInput): MicroReviewResult {
  return runMicroReview(input);
}
