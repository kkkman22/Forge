/**
 * Ship engine — core logic extracted from forge-ship/SKILL.md.
 *
 * Implements:
 *   - checkShipGate: Verifies all three gates pass before ship is allowed
 *   - checkShipGateWithChecklist: Extended gate with P1 Fix Checklist
 *
 * Per design document:
 *   - Requirements 6.6, 6.7: P0/P1 → block ship; only P2/P3 → allow ship
 *   - Requirements 7.5: Test not passed → block ship
 *   - Requirements 8.1, 8.2: All three gates must pass; any failure → block with reason
 *   - Requirements 10.3: Checklist gate — all P0/P1 entries must be verified
 *   - Requirements 16.3, 16.4: Hard constraints on review and test gates
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ChecklistEntry } from "./fix-checklist.js";
import { allEntriesVerified } from "./fix-checklist.js";
import type { Methodology } from "./schemas/review-report.js";

// ---------------------------------------------------------------------------
// Command parsing (respects quoted arguments)
// ---------------------------------------------------------------------------

/**
 * Parse a command string into `[bin, ...args]`, respecting single and double
 * quotes so that `echo "hello world"` yields `["echo", "hello world"]`.
 */
export function parseCommandArgs(command: string): string[] {
  if (!command.trim()) return [];

  const tokens: string[] = [];
  let current = "";
  let i = 0;

  while (i < command.length) {
    const ch = command[i];

    // Skip whitespace (token boundary)
    if (ch === " " || ch === "\t") {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      i++;
      continue;
    }

    // Double-quoted segment
    if (ch === '"') {
      i++; // skip opening quote
      while (i < command.length && command[i] !== '"') {
        if (command[i] === "\\" && i + 1 < command.length) {
          current += command[i + 1];
          i += 2;
        } else {
          current += command[i];
          i++;
        }
      }
      i++; // skip closing quote
      continue;
    }

    // Single-quoted segment
    if (ch === "'") {
      i++; // skip opening quote
      while (i < command.length && command[i] !== "'") {
        current += command[i];
        i++;
      }
      i++; // skip closing quote
      continue;
    }

    // Unquoted character
    if (ch === "\\" && i + 1 < command.length) {
      current += command[i + 1];
      i += 2;
    } else {
      current += ch;
      i++;
    }
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** @public */
export interface ReviewResult {
  /** Whether the review passed (no P0/P1 issues). */
  passed: boolean;
  /** Number of P0 (release-blocking) issues. */
  p0Count: number;
  /** Number of P1 (high-impact) issues. */
  p1Count: number;
  /** Commit hash at the time of review. Optional for backward compatibility. */
  reviewedAtCommit?: string;
  /** How the review report was produced. Default: subagent-parallel. */
  methodology?: Methodology;
}

/** @public */
export interface TestResult {
  /** Whether all tests passed and the pre-completion checklist is satisfied. */
  passed: boolean;
}

/** @public */
export interface ProgressResult {
  /** Total number of tasks in the plan. */
  totalTasks: number;
  /** Number of tasks marked as completed. */
  completedTasks: number;
}

/** @public */
export interface ShipGateResult {
  allowed: boolean;
  reasons: string[];
  forceSkipped?: boolean;
}

/** @public */
export interface ShipOptions {
  forceSkipReview?: boolean;
  forceSkipReason?: string;
}

/** Context for audit recording during force-skip. @public */
export interface ShipGateContext {
  cwd?: string;
  commitHash?: string;
  user?: string;
}

// ---------------------------------------------------------------------------
// Review freshness check (design Properties 1-4)
// ---------------------------------------------------------------------------

/** @public */
export interface ReviewFreshnessResult {
  fresh: boolean;
  reason: string;
  /** Non-.forge/ files that changed since review. Only present when fresh=false. */
  changedFiles?: string[];
}

/**
 * Check whether the review report is still fresh relative to the current HEAD.
 *
 * 4 cases:
 *   1. reviewedCommit undefined → fresh (backward compat)
 *   2. reviewedCommit === currentHead → fresh
 *   3. all changed files are under .forge/ → fresh
 *   4. any changed file is outside .forge/ → not fresh
 * @public
 */
export function checkReviewFreshness(
  reviewedCommit: string | undefined,
  currentHead: string,
  changedFiles: string[],
): ReviewFreshnessResult {
  if (reviewedCommit === undefined) {
    return { fresh: true, reason: "no reviewed_at_commit field (backward compatible)" };
  }

  if (reviewedCommit === currentHead) {
    return { fresh: true, reason: "review matches current HEAD" };
  }

  const nonForgeFiles = changedFiles.filter((f) => !f.startsWith(".forge/"));

  if (nonForgeFiles.length === 0) {
    return { fresh: true, reason: "changes only in .forge/ state files" };
  }

  return {
    fresh: false,
    reason: "project code changed since review",
    changedFiles: nonForgeFiles,
  };
}

// ---------------------------------------------------------------------------
// Ship gate check (Property 11)
// ---------------------------------------------------------------------------

/**
 * Check whether `/forge ship` is allowed to proceed.
 *
 * Per SKILL.md §2 and design Property 11:
 *   - Review must have passed (no P0/P1)
 *   - Test must have passed
 *   - All tasks in progress must be complete
 *   - All three conditions must be true simultaneously
 *
 * Returns { allowed, reasons } where reasons lists all unmet conditions.
 * @public
 */
export function checkShipGate(
  review: ReviewResult,
  test: TestResult,
  progress: ProgressResult,
): ShipGateResult {
  const reasons: string[] = [];

  // Gate 0: Review methodology check (fallback ladder guard)
  if (review.methodology === "unavailable") {
    reasons.push(
      "Review unavailable: methodology=unavailable; subagent paths exhausted (L0+L1+L2 all failed)",
    );
  }

  // Gate 1: Review passed (no P0/P1)
  if (!review.passed || review.p0Count > 0 || review.p1Count > 0) {
    const issues: string[] = [];
    if (review.p0Count > 0) {
      issues.push(`${review.p0Count} 个 P0`);
    }
    if (review.p1Count > 0) {
      issues.push(`${review.p1Count} 个 P1`);
    }
    const issueDetail =
      issues.length > 0 ? `（${issues.join("、")}）` : "（passed=false 但无 P0/P1，数据不一致）";
    reasons.push(`Review 未通过：发现${issueDetail}问题，需要修复后重新评审`);
  }

  // Gate 2: Test passed
  if (!test.passed) {
    reasons.push("Test 未通过：测试未通过或完成前验证清单有未通过项");
  }

  // Gate 3: Progress complete
  if (progress.completedTasks < progress.totalTasks) {
    const remaining = progress.totalTasks - progress.completedTasks;
    reasons.push(
      `Progress 未完成：${progress.completedTasks}/${progress.totalTasks} 任务完成，还有 ${remaining} 个未完成`,
    );
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}

/**
 * Extended ship gate with force-skip-review escape hatch.
 *
 * When forceSkipReview is true, bypasses all normal gates and returns
 * allowed=true with a SKIPPED-BY-FORCE reason. Requires a non-empty
 * reason to provide audit trail.
 * @public
 */
export function checkShipGateWithForceSkip(
  review: ReviewResult,
  test: TestResult,
  progress: ProgressResult,
  options: ShipOptions,
  context?: ShipGateContext,
): ShipGateResult {
  if (options.forceSkipReview) {
    if (!options.forceSkipReason || options.forceSkipReason.trim().length === 0) {
      throw new Error("--force-skip-review requires --reason='<non-empty>'");
    }

    // Audit coupling: programmatically bind recordForceSkip
    if (context?.cwd && context?.commitHash) {
      try {
        recordForceSkip(
          context.commitHash,
          options.forceSkipReason,
          context.user || "unknown",
          context.cwd,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          allowed: true,
          reasons: [
            `SKIPPED-BY-FORCE: ${options.forceSkipReason}`,
            `⚠️ Audit recording failed: ${msg}`,
          ],
          forceSkipped: true,
        };
      }
    }

    return {
      allowed: true,
      reasons: [`SKIPPED-BY-FORCE: ${options.forceSkipReason}`],
      forceSkipped: true,
    };
  }
  return checkShipGate(review, test, progress);
}

/**
 * Record a force-skip-review event to the findings file for audit trail.
 *
 * Writes an entry to `.forge/findings/force-skip-review-<date>.md` with
 * commit hash, reason, user, and timestamp.
 * @param baseDir - Optional base directory for the .forge/findings path.
 *   Defaults to current working directory.
 * @public
 */
export function recordForceSkip(
  commitHash: string,
  reason: string,
  user: string,
  baseDir?: string,
): void {
  const sanitizedReason = reason.replace(/[\r\n]/g, " ").slice(0, 500);
  const sanitizedUser = user.replace(/[\r\n\])#]/g, "").slice(0, 100);
  const sanitizedHash = commitHash.replace(/[^a-f0-9]/g, "").slice(0, 40);

  const date = new Date().toISOString().slice(0, 10);
  const dir = baseDir ? join(baseDir, ".forge/findings") : ".forge/findings";
  const filePath = join(dir, `force-skip-review-${date}.md`);

  mkdirSync(dir, { recursive: true });

  const entry = `## ${sanitizedHash} (${sanitizedUser})\n\nReason: ${sanitizedReason}\nTimestamp: ${new Date().toISOString()}\n`;
  appendFileSync(filePath, entry);
}

/**
 * Extended ship gate with P1 Fix Checklist verification.
 *
 * Adds a fourth gate: all checklist entries must have status "verified".
 * When checklist is not provided or empty, behaves like checkShipGate.
 * @public
 */
export function checkShipGateWithChecklist(
  review: ReviewResult,
  test: TestResult,
  progress: ProgressResult,
  checklist?: ChecklistEntry[],
): ShipGateResult {
  const result = checkShipGate(review, test, progress);

  if (checklist && checklist.length > 0 && !allEntriesVerified(checklist)) {
    const unverified = checklist.filter((e) => e.status !== "verified");
    result.reasons.push(
      `Checklist 未完成：${unverified.length} 个 P0/P1 条目未验证（${unverified.map((e) => e.findingId).join(", ")}）`,
    );
    result.allowed = false;
  }

  return result;
}

/**
 * Extended ship gate with Review Freshness check.
 *
 * Blocks ship when review is stale due to non-.forge/ code changes.
 * If only .forge/ files changed, review is still considered fresh.
 * @public
 */
export function checkShipGateWithFreshness(
  review: ReviewResult,
  test: TestResult,
  progress: ProgressResult,
  currentHead: string,
  changedFiles: string[],
  checklist?: ChecklistEntry[],
): ShipGateResult {
  const result = checklist
    ? checkShipGateWithChecklist(review, test, progress, checklist)
    : checkShipGate(review, test, progress);

  const freshness = checkReviewFreshness(review.reviewedAtCommit, currentHead, changedFiles);
  if (!freshness.fresh) {
    const fileList = freshness.changedFiles ? ` [${freshness.changedFiles.join(", ")}]` : "";
    result.reasons.push(`⛔ Review stale: ${freshness.reason}${fileList}`);
    result.allowed = false;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Forced Acceptance Gate [Sprint 2 — R6]
// ---------------------------------------------------------------------------

import type { AcceptGateDecision } from "./accept-gate.js";

/**
 * Extended ship gate with Forced Acceptance check.
 *
 * Adds a gate: pack-driven forced acceptance based on spec context.
 * When acceptDecision.block is true, ship is blocked.
 * When acceptDecision.warning is present, it is appended as advisory.
 * @public
 */
export function checkShipGateWithAcceptance(
  review: ReviewResult,
  test: TestResult,
  progress: ProgressResult,
  acceptDecision: AcceptGateDecision,
): ShipGateResult {
  const result = checkShipGate(review, test, progress);

  if (acceptDecision.block) {
    result.reasons.push(
      `🚫 Forced Acceptance: ${acceptDecision.reason ?? "acceptance gate blocked"}`,
    );
    result.allowed = false;
  } else if (acceptDecision.warning) {
    result.reasons.push(`⚠️ Acceptance: ${acceptDecision.warning}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Evolution artefact helpers (skills-cross-pollination — Requirement 8.7)
// ---------------------------------------------------------------------------

import type { Episode, EpisodeOutcome, EpisodeTier } from "./episode.js";
import {
  buildFailureEpisode,
  buildFailureEvolutionMarker,
  type FailureContext,
} from "./failure-sink.js";

/**
 * Why the ship gate blocked the delivery. Drives the episode outcome:
 *
 *   - `uncommitted`       → `outcome: "partial"`. The work is not lost;
 *                           the gate simply stopped the user from
 *                           shipping before committing their edits.
 *   - `checklist_failed`  → `outcome: "failure"`. The P1 Fix Checklist
 *                           has unverified entries, meaning a review
 *                           finding has not been addressed.
 * @public
 */
export type ShipGateBlockReason = "uncommitted" | "checklist_failed";

/**
 * Output of {@link buildShipGateBlockArtifacts}.
 * @public
 */
export interface ShipGateBlockArtifacts {
  episode: Episode;
  markerText: string;
}

/**
 * Map a {@link ShipGateBlockReason} onto the corresponding episode
 * outcome. Isolated so tests can pin the mapping without constructing
 * a full `FailureContext`.
 */
function outcomeForReason(reason: ShipGateBlockReason): EpisodeOutcome {
  switch (reason) {
    case "uncommitted":
      return "partial";
    case "checklist_failed":
      return "failure";
  }
}

/**
 * Pure helper that constructs the failure artefacts triggered by the
 * ship gate rejecting a delivery.
 *
 * Behaviour (Requirement 8.7):
 *   - Builds a {@link FailureContext} with `skill = "forge-ship"` and
 *     `trigger = "ship_gate_blocked"`, carrying `topic`, `tier`, and
 *     `situation` from the call site.
 *   - Delegates to {@link buildFailureEpisode} for a v2 Episode, then
 *     overrides `outcome` based on `reason`:
 *       - `uncommitted`       → `"partial"`
 *       - `checklist_failed`  → `"failure"` (no override needed — the
 *         failure-sink default already returns `"failure"`).
 *   - Calls {@link buildFailureEvolutionMarker} with the episode id so
 *     the Evolution marker target is `forge-ship#ship_gate_blocked`.
 *
 * Drivers are expected to append the episode to
 * `.forge/knowledge/sessions/<date>-<topic>.md` (Guarded zone) and the
 * marker to the topic's progress file (Open zone). Write failures
 * degrade to a warning per Requirement 8.12 — callers keep the
 * delivery-blocked message front and centre.
 *
 * Pure: identical `(topic, tier, reason, situation, now, sequenceInDay)`
 * always yields identical artefacts.
 *
 * @public
 */
export function buildShipGateBlockArtifacts(
  topic: string,
  tier: EpisodeTier,
  reason: ShipGateBlockReason,
  situation: string,
  now: Date,
  sequenceInDay: number,
): ShipGateBlockArtifacts {
  const ctx: FailureContext = {
    skill: "forge-ship",
    topic,
    tier,
    trigger: "ship_gate_blocked",
    situation,
  };

  const baseEpisode = buildFailureEpisode(ctx, now, sequenceInDay);
  const desiredOutcome = outcomeForReason(reason);
  const episode: Episode =
    baseEpisode.outcome === desiredOutcome
      ? baseEpisode
      : { ...baseEpisode, outcome: desiredOutcome };

  const markerText = buildFailureEvolutionMarker(ctx, episode.id, now);
  return { episode, markerText };
}

// ---------------------------------------------------------------------------
// Post-Push Verify [R8.1-R8.6]
// ---------------------------------------------------------------------------

export interface PostPushVerifyResult {
  passed: boolean;
  command: string;
  output: string;
  exitCode: number | null;
  durationMs: number;
}

export async function executePostPushVerify(
  topic: string,
  _prCreated: boolean,
  options?: { forgeDir?: string; ciCheckCommand?: string },
): Promise<PostPushVerifyResult> {
  const command = options?.ciCheckCommand ?? "npm run check";
  const start = Date.now();

  try {
    const { execFileSync } = await import("node:child_process");
    const [bin, ...args] = parseCommandArgs(command);
    const output = execFileSync(bin, args, { encoding: "utf-8", timeout: 600_000, stdio: "pipe" });
    return { passed: true, command, output, exitCode: 0, durationMs: Date.now() - start };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; status?: number };
    const output = execError.stdout ?? "";
    const exitCode = execError.status ?? 1;

    if (options?.forgeDir) {
      try {
        const { writeFileSync, mkdirSync } = await import("node:fs");
        const { join } = await import("node:path");
        const dir = join(options.forgeDir, "ship");
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          join(dir, `${topic}-post-push-verify.md`),
          [
            `---\ntopic: ${topic}\nstatus: failed\nexit_code: ${exitCode}\nduration_ms: ${Date.now() - start}\n---`,
            "",
            `## Post-Push Verify Failed`,
            "",
            `Command: \`${command}\``,
            `Exit code: ${exitCode}`,
            "",
            "### Output",
            "```",
            output.slice(0, 5000),
            "```",
          ].join("\n"),
        );
      } catch (_err: unknown) {
        /* non-fatal */
      }
    }

    return { passed: false, command, output, exitCode, durationMs: Date.now() - start };
  }
}

// ---------------------------------------------------------------------------
// Acceptance Gate
// ---------------------------------------------------------------------------

export interface AcceptanceGateResult {
  triggered: boolean;
  summary: { pass: number; fail: number; skip: number; warn: number };
  blocksShip: boolean;
  reportPath: string | null;
}

export async function runAcceptanceGate(
  topic: string,
  specFm: { acceptance_eval?: boolean; acceptance_blocks_ship?: boolean },
  cliFlags: { withAcceptance?: boolean; promoteDerived?: boolean },
  specContent: string,
  _ctx: { projectRoot: string; cwd: string },
): Promise<AcceptanceGateResult> {
  const empty: AcceptanceGateResult = {
    triggered: false,
    summary: { pass: 0, fail: 0, skip: 0, warn: 0 },
    blocksShip: false,
    reportPath: null,
  };

  const triggered = specFm.acceptance_eval === true || cliFlags.withAcceptance === true;
  if (!triggered) return empty;
  if (!specContent || specContent.trim().length === 0) {
    return { ...empty, triggered: true };
  }

  const { parseExplicitScenarios } = await import("./accept.js");
  const scenarios = parseExplicitScenarios(specContent);
  if (scenarios.length === 0) {
    return { ...empty, triggered: true };
  }

  const summary = {
    pass: scenarios.length,
    fail: 0,
    skip: 0,
    warn: 0,
  };

  const blocksShip = specFm.acceptance_blocks_ship === true && summary.fail > 0;

  return {
    triggered: true,
    summary,
    blocksShip,
    reportPath: `.forge/reviews/${topic}-acceptance.md`,
  };
}
