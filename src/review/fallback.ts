/**
 * Fallback ladder implementation (R1, R2, R3, R5) and truncation-triggered retry.
 *
 * @module review/fallback
 *
 * @remarks L0–L3 numbering (audit P3-2, 2026-07-16): this module's ladder and
 * the gate-facing ladder in `.claude/rules/workflow-fallback-ladder.md` /
 * `src/ship-gates.ts` use the **same L0–L3 labels but different mappings**.
 * They are two distinct ladders, not one:
 *
 *   This module (review-execution ladder):
 *     L0 = subagent-parallel → L1 = subagent-serial → L2 = ci-evidence → L3 = unavailable
 *
 *   Gate / doc ladder (ship-gates.ts `evaluateFallbackLadder`, workflow-fallback-ladder.md):
 *     L0 = saved-workflow → L1 = subagent-parallel → L2 = subagent-serial → L3 = unavailable
 *
 * The gate ladder has an extra saved-workflow rung (L0) that this execution
 * ladder doesn't model, so `ci-evidence` (L2 here) has no column in the doc
 * table. When reading either, cross-check against `Methodology` values, not
 * the L-number alone. Both agree only on the terminal: L3 = unavailable blocks ship.
 */

import { readFileSync } from "node:fs";
import { enforceFinalReportContract, validateFinalReportBlock } from "../review-final-block.js";
import type { Methodology } from "../schemas/review-report.js";
import { runSubagentsWithConcurrency } from "../subagent-runner.js";
import type { SubagentInvocation, SubagentResult } from "../types.js";
import { splitFrontmatterAndBody } from "./frontmatter.js";
import { extractSeverity, hasAnySeverityField } from "./severity-parser.js";
import { processReviewTruncation } from "./subagent.js";

export interface FallbackLadderInput {
  /** Subagent invocations to execute. */
  invocations: SubagentInvocation[];
  /** Executor function for each invocation. */
  executor: (inv: SubagentInvocation) => Promise<SubagentResult>;
  /** Optional path to CI evidence file. */
  ciEvidencePath?: string;
}

export interface FallbackLadderResult {
  /** The methodology used to produce the review. */
  methodology: Methodology;
  /** Successfully completed subagent results. */
  succeeded: Array<{ agentType: string; result: string }>;
  /** Failed subagent records. */
  failed: Array<{ agentType: string; error: string }>;
  /** Trace of fallback ladder execution. */
  trace: FallbackLadderTrace[];
  /** Number of retries performed (0 or 1). */
  retryCount: number;
  /** Signature of L0 failure (e.g., "task-id-purge"). */
  l0FailureSignature?: string;
  /** CI evidence if L2 was used. */
  ciEvidence?: { severity_counts: Record<string, number>; raw: string };
}

export interface FallbackLadderTrace {
  level: "L0" | "L1" | "L2" | "L3";
  startedAt: number;
  finishedAt: number;
  outcome: "all-success" | "partial-success" | "all-fail" | "ci-hit" | "ci-miss" | "unavailable";
}

export interface TruncationAwareResult extends FallbackLadderResult {
  /** Truncation assessment when subagent results were collected. Undefined if execution failed. */
  truncationAssessment?: import("../truncation-detection.js").TruncationAssessment;
}

/**
 * Execute the review fallback ladder: L0 → L1 → L2 → L3.
 */
export async function runReviewFallbackLadder(
  input: FallbackLadderInput,
): Promise<FallbackLadderResult> {
  const trace: FallbackLadderTrace[] = [];

  const guardedExecutor = async (inv: SubagentInvocation): Promise<SubagentResult> => {
    const raw = await input.executor(inv);
    return enforceFinalReportContract(raw);
  };

  const reclassifyResult = (res: {
    succeeded: Array<{ agentType: string; result: string }>;
    failed: Array<{ agentType: string; error: string }>;
  }): {
    succeeded: Array<{ agentType: string; result: string }>;
    failed: Array<{ agentType: string; error: string }>;
  } => {
    const succeeded: Array<{ agentType: string; result: string }> = [];
    const failed = [...res.failed];
    for (const ok of res.succeeded) {
      const v = validateFinalReportBlock(ok.result, ok.agentType);
      if (v.valid) {
        succeeded.push(ok);
      } else {
        failed.push({ agentType: ok.agentType, error: `incomplete-report:${v.reason}` });
      }
    }
    return { succeeded, failed };
  };

  // ─── L0: Default parallel path ───
  const l0Start = Date.now();
  const l0Raw = await runSubagentsWithConcurrency(input.invocations, guardedExecutor, 3);
  const l0 = reclassifyResult(l0Raw);
  const l0AllFail = l0.succeeded.length === 0;
  trace.push({
    level: "L0",
    startedAt: l0Start,
    finishedAt: Date.now(),
    outcome: l0AllFail ? "all-fail" : l0.failed.length > 0 ? "partial-success" : "all-success",
  });

  if (!l0AllFail) {
    return {
      methodology: "subagent-parallel",
      succeeded: l0.succeeded,
      failed: l0.failed,
      trace,
      retryCount: 0,
    };
  }

  // ─── L1: Serial retry ───
  const l0Sig = summarizeFailureSignature(l0.failed);
  // biome-ignore lint/suspicious/noConsole: User feedback for fallback ladder
  console.warn(`⚠ L0 subagent dispatch failed (${l0Sig}); retrying with concurrency=1...`);

  const l1Start = Date.now();
  const l1Raw = await runSubagentsWithConcurrency(input.invocations, guardedExecutor, 1);
  const l1 = reclassifyResult(l1Raw);
  const l1AllFail = l1.succeeded.length === 0;
  trace.push({
    level: "L1",
    startedAt: l1Start,
    finishedAt: Date.now(),
    outcome: l1AllFail ? "all-fail" : l1.failed.length > 0 ? "partial-success" : "all-success",
  });

  // biome-ignore lint/suspicious/noConsole: User feedback for fallback ladder
  console.warn(
    `L1 retry result: ${l1.succeeded.length}/${input.invocations.length} subagents recovered`,
  );

  if (!l1AllFail) {
    return {
      methodology: "subagent-serial",
      succeeded: l1.succeeded,
      failed: l1.failed,
      trace,
      retryCount: 1,
      l0FailureSignature: l0Sig,
    };
  }

  // ─── L2: CI evidence ───
  // biome-ignore lint/suspicious/noConsole: User feedback for fallback ladder
  console.warn(`⚠ L1 retry exhausted; checking CI evidence (L2)...`);
  const l2Start = Date.now();

  if (input.ciEvidencePath) {
    const ciResult = tryParseCiEvidence(input.ciEvidencePath);
    if (ciResult) {
      trace.push({ level: "L2", startedAt: l2Start, finishedAt: Date.now(), outcome: "ci-hit" });
      return {
        methodology: "ci-evidence",
        succeeded: [],
        failed: [],
        trace,
        retryCount: 1,
        l0FailureSignature: l0Sig,
        ciEvidence: ciResult,
      };
    }
  }
  trace.push({ level: "L2", startedAt: l2Start, finishedAt: Date.now(), outcome: "ci-miss" });

  // ─── L3: Unavailable ───
  trace.push({
    level: "L3",
    startedAt: Date.now(),
    finishedAt: Date.now(),
    outcome: "unavailable",
  });

  return {
    methodology: "unavailable",
    succeeded: [],
    failed: l1.failed,
    trace,
    retryCount: 1,
    l0FailureSignature: l0Sig,
  };
}

/**
 * Execute review with truncation-aware handling.
 */
export async function runReviewWithTruncationHandling(
  input: FallbackLadderInput,
): Promise<TruncationAwareResult> {
  const result = await runReviewFallbackLadder(input);

  if (result.methodology === "unavailable" || result.succeeded.length === 0) {
    return result;
  }

  const assessment = processReviewTruncation(result.succeeded);

  if (assessment.action === "annotate") {
    const layers = assessment.truncatedLayers.join(", ");
    // biome-ignore lint/suspicious/noConsole: User feedback for truncation annotation
    console.warn(`⚠ Layer ${layers} report truncated — marked as [数据不完整]`);
  } else if (assessment.action === "warn") {
    // biome-ignore lint/suspicious/noConsole: User feedback for truncation warning
    console.warn(
      `⚠ ${assessment.truncatedCount}/${assessment.totalCount} review layers truncated — consider re-running /tinkerman review`,
    );
  }

  if (assessment.action !== "degrade") {
    return { ...result, truncationAssessment: assessment };
  }

  // ─── Truncation-triggered serial retry ───
  // biome-ignore lint/suspicious/noConsole: User feedback for truncation retry
  console.warn(
    `⚠ All ${assessment.truncatedCount} review layers truncated; retrying with serial execution...`,
  );

  const retryStart = Date.now();
  const retryRaw = await runSubagentsWithConcurrency(input.invocations, input.executor, 1);

  const retrySucceeded: Array<{ agentType: string; result: string }> = [];
  const retryFailed = [...result.failed];
  for (const ok of retryRaw.succeeded) {
    const v = validateFinalReportBlock(ok.result, ok.agentType);
    if (v.valid) {
      retrySucceeded.push(ok);
    } else {
      retryFailed.push({ agentType: ok.agentType, error: `incomplete-report:${v.reason}` });
    }
  }

  if (retrySucceeded.length > 0) {
    const retryAssessment = processReviewTruncation(retrySucceeded);

    if (retryAssessment.action !== "degrade") {
      return {
        methodology: "subagent-serial",
        succeeded: retrySucceeded,
        failed: retryFailed.length > 0 ? retryFailed : result.failed,
        trace: [
          ...result.trace,
          {
            level: "L1",
            startedAt: retryStart,
            finishedAt: Date.now(),
            outcome: retryAssessment.action === "proceed" ? "all-success" : "partial-success",
          },
        ],
        retryCount: result.retryCount + 1,
        l0FailureSignature: result.l0FailureSignature,
        truncationAssessment: retryAssessment,
      };
    }
  }

  return {
    methodology: "unavailable",
    succeeded: [],
    failed: [...result.failed, ...retryRaw.failed],
    trace: [
      ...result.trace,
      {
        level: "L3",
        startedAt: retryStart,
        finishedAt: Date.now(),
        outcome: "unavailable",
      },
    ],
    retryCount: result.retryCount + 1,
    l0FailureSignature: result.l0FailureSignature,
    truncationAssessment: assessment,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function summarizeFailureSignature(failed: Array<{ agentType: string; error: string }>): string {
  const errorTypes = new Set(
    failed.map((f) => {
      if (/No task found with ID/.test(f.error)) return "task-id-purge";
      if (/timeout/i.test(f.error)) return "timeout";
      if (/turn limit/i.test(f.error)) return "turn-limit";
      if (/^incomplete-report:/.test(f.error)) return "incomplete-report";
      return "other";
    }),
  );
  return Array.from(errorTypes).join(",");
}

function tryParseCiEvidence(
  path: string,
): { severity_counts: Record<string, number>; raw: string } | null {
  try {
    if (path.includes("..")) {
      return null;
    }
    const normalized = path.replace(/\\/g, "/");
    if (!normalized.includes(".forge/reviews/")) {
      return null;
    }
    const content = readFileSync(path, "utf-8");
    const { fm } = splitFrontmatterAndBody(content);

    // T-05 (REQ-04): preserve L2→L3 downgrade semantics. A CI evidence file
    // with NO severity info at all must return null (→ downgrade to L3,
    // conservative), NOT be collapsed to {0,0,0,0} (which would read as
    // "0 findings → pass L2"). hasAnySeverityField distinguishes the two.
    if (!hasAnySeverityField(fm)) {
      return null;
    }

    const severity = extractSeverity(fm);
    return {
      severity_counts: {
        p0: severity.p0,
        p1: severity.p1,
        p2: severity.p2,
        p3: severity.p3,
      },
      raw: content,
    };
  } catch (_err: unknown) {
    return null;
  }
}
