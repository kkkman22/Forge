/**
 * WorkflowDispatcher — orchestrates L0/L1/L2/L3 fallback ladder for
 * /forge review, /forge decide, /forge learn.
 *
 * This module implements the dispatcher *skeleton*: pure functions for
 * eligibility probing, error classification, dispatch.jsonl audit
 * writing, and status.md updates. The actual L0 invocation (`bp()`)
 * and L1 ladder (`runReviewFallbackLadder` / `forge-decide-lead` /
 * `forge-learn`) are wired up by the caller — typically the SKILL
 * dispatcher or `forge-loop-cli.ts`.
 *
 * See:
 *   - .kiro/specs/workflows-integration/requirements.md §Requirement 2
 *   - .kiro/specs/workflows-integration/design.md §3.2
 *   - .claude/rules/workflow-fallback-ladder.md
 *   - ADR 2026-05-18-review-fallback-ladder.md
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  appendDispatchRecord,
  type ChosenLevel,
  type DispatchRecord,
  type L0FailureSignature,
  type L1TriggerReason,
  type Mode,
  type Subcommand,
} from "./dispatch-record.js";

export type { ChosenLevel, DispatchRecord, L0FailureSignature, L1TriggerReason, Mode, Subcommand };

const SAFE_SLUG_RE = /^[a-zA-Z0-9._-]{1,64}$/;

export class InvalidRunIdError extends Error {
  constructor(value: string) {
    super(`invalid runId: ${JSON.stringify(value)} — must match ${SAFE_SLUG_RE.source}`);
    this.name = "InvalidRunIdError";
  }
}

export class RunDirContainmentError extends Error {
  constructor(dest: string, base: string) {
    super(`runDir containment violation: ${dest} escapes ${base}`);
    this.name = "RunDirContainmentError";
  }
}

function assertSafeRunId(runId: string): void {
  if (!SAFE_SLUG_RE.test(runId) || runId === "." || runId === "..") {
    throw new InvalidRunIdError(runId);
  }
}

function assertRunDirContained(forgeRoot: string, runDir: string): void {
  const absBase = isAbsolute(forgeRoot) ? join(forgeRoot, "runs") : resolve(forgeRoot, "runs");
  const absDest = resolve(runDir);
  if (
    absDest !== absBase &&
    !absDest.startsWith(`${absBase}/`) &&
    !absDest.startsWith(`${absBase}\\`)
  ) {
    throw new RunDirContainmentError(absDest, absBase);
  }
}

export interface DispatchContext {
  subcommand: Subcommand;
  runId: string;
  sessionId: string;
  mode: Mode;
  /** Absolute path to .forge/ directory. */
  forgeRoot: string;
  /** Absolute path to ${CLAUDE_PLUGIN_ROOT}. */
  pluginRoot: string;
}

export interface ProbeResult {
  eligible: boolean;
  reason?: L1TriggerReason;
}

/**
 * Probe whether L0 (native workflow) path is eligible for the given context.
 *
 * Five conditions (all must pass):
 *   1. process.env.CLAUDE_CODE_WORKFLOWS === '1'
 *   2. ctx.mode === 'interactive'
 *   3. ${pluginRoot}/workflows/<subcommand>.js exists
 *   4. node --check on the workflow file passes
 *   5. ${pluginRoot}/workflows/lib/concurrency.js exists AND workflow source
 *      imports from './lib/concurrency'
 *
 * The 5th condition (tengu_workflows_enabled gate) is inferred at runtime
 * by attempting `bp()` — if `bp` is undefined, classify as bp_exception.
 */
export function probeL0Eligibility(ctx: DispatchContext): ProbeResult {
  if (process.env.CLAUDE_CODE_WORKFLOWS !== "1") {
    return { eligible: false, reason: "env_unset" };
  }
  if (ctx.mode !== "interactive") {
    return { eligible: false, reason: "non_interactive" };
  }

  const workflowPath = resolveWorkflowFile(ctx);
  if (!existsSync(workflowPath)) {
    return { eligible: false, reason: "workflow_missing" };
  }

  try {
    execFileSync("node", ["--check", workflowPath], { stdio: "pipe" });
  } catch {
    return { eligible: false, reason: "workflow_syntax_error" };
  }

  const concurrencyHelper = join(ctx.pluginRoot, "workflows", "lib", "concurrency.js");
  if (!existsSync(concurrencyHelper)) {
    return { eligible: false, reason: "concurrency_uncontrolled" };
  }

  const workflowSource = readFileSync(workflowPath, "utf-8");
  if (
    !workflowSource.includes("from './lib/concurrency'") &&
    !workflowSource.includes('from "./lib/concurrency"') &&
    !workflowSource.includes("from './lib/concurrency.js'") &&
    !workflowSource.includes('from "./lib/concurrency.js"')
  ) {
    return { eligible: false, reason: "concurrency_uncontrolled" };
  }

  return { eligible: true };
}

/**
 * Resolve the L1 trigger reason. If the caller supplies an explicit reason,
 * pass it through; otherwise default to `unmatched_state` (the catch-all
 * for AC R2.9 — no state-space black holes).
 */
export function resolveL1Trigger(reason?: L1TriggerReason): L1TriggerReason {
  return reason ?? "unmatched_state";
}

/**
 * Classify a thrown error from L0 execution into one of the five
 * documented failure signatures. Falls back to `bp_exception` for
 * unrecognised errors so dispatch records remain well-formed.
 */
export function classifyL0Failure(err: unknown): L0FailureSignature {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const lower = message.toLowerCase();

  if (
    lower.includes("frozen_zone") ||
    lower.includes("frozen-zone") ||
    lower.includes("frozen zone")
  ) {
    return "frozen_zone_blocked";
  }
  if (lower.includes("stuck") || lower.includes("timeout")) {
    return "stuck_timeout";
  }
  if (lower.includes("subprocess") || lower.includes("sigsegv") || lower.includes("crashed")) {
    return "subprocess_crash";
  }
  if (lower.includes("schema") && (lower.includes("valid") || lower.includes("validation"))) {
    return "schema_validation_failed";
  }
  return "bp_exception";
}

/**
 * Append a DispatchRecord as a single JSON line to
 * .forge/runs/<runId>/dispatch.jsonl. Creates parent directories as needed.
 *
 * Returns the absolute path to the JSONL file.
 */
export function writeDispatchRecord(ctx: DispatchContext, record: DispatchRecord): string {
  // F14: validate runId at the dispatcher boundary; assert resolved
  // .forge/runs/<runId>/ stays under forgeRoot. Defence-in-depth against
  // ".." / "/etc" / NUL-byte payloads slipping in via session metadata.
  assertSafeRunId(ctx.runId);
  const runDir = join(ctx.forgeRoot, "runs", ctx.runId);
  assertRunDirContained(ctx.forgeRoot, runDir);
  return appendDispatchRecord(ctx.forgeRoot, ctx.runId, record);
}

/**
 * Update .forge/status.md with the three dispatch fields (R2.10):
 *   dispatch_chosen_level
 *   dispatch_subcommand
 *   dispatch_run_id
 *
 * When chosen_level is L3, also updates `phase` to `<subcommand>-blocked`
 * so forge-ship SKILL can read the field and block ship without parsing
 * dispatch.jsonl.
 */
export function updateStatusMd(ctx: DispatchContext, level: ChosenLevel): void {
  const statusPath = join(ctx.forgeRoot, "status.md");
  let content = existsSync(statusPath) ? readFileSync(statusPath, "utf-8") : "";

  content = upsertField(content, "dispatch_chosen_level", level);
  content = upsertField(content, "dispatch_subcommand", ctx.subcommand);
  content = upsertField(content, "dispatch_run_id", ctx.runId);

  if (level === "L3") {
    content = upsertField(content, "phase", `${ctx.subcommand}-blocked`);
  }

  mkdirSync(dirname(statusPath), { recursive: true });
  writeFileSync(statusPath, content);
}

/**
 * Write partial findings (from a failed L0 phase) to an isolated location
 * inside .forge/runs/<runId>/l0-partial/<subcommand>-<timestamp>.md.
 *
 * **Crucially**, this MUST NOT write to .forge/reviews/ or
 * .forge/decisions/ — those are Guarded zones reserved for the L1 retry
 * product. The L1 product's frontmatter cross-references the partial
 * via `precursor_partial:` field.
 */
export function isolatePartialFindings(ctx: DispatchContext, partialContent: string): string {
  // F14: same validation as writeDispatchRecord — partial findings live
  // under the same `.forge/runs/<runId>/` tree.
  assertSafeRunId(ctx.runId);
  const partialDir = join(ctx.forgeRoot, "runs", ctx.runId, "l0-partial");
  assertRunDirContained(ctx.forgeRoot, partialDir);
  mkdirSync(partialDir, { recursive: true });
  const timestamp = Date.now();
  const path = join(partialDir, `${ctx.subcommand}-${timestamp}.md`);
  writeFileSync(path, partialContent);
  return path;
}

// ── internal helpers ──────────────────────────────────────────────────────

function resolveWorkflowFile(ctx: DispatchContext): string {
  // Map subcommand → workflow filename. For now, only review has a workflow;
  // decide/learn workflows can ship later. Caller can override by passing
  // their own pluginRoot/workflow layout; default convention is
  // ${pluginRoot}/workflows/<subcommand>.js, with `review` aliased to the
  // multi-agent-review.js implementation.
  const filename = ctx.subcommand === "review" ? "review.js" : `${ctx.subcommand}.js`;
  const primary = join(ctx.pluginRoot, "workflows", filename);
  if (existsSync(primary)) return primary;
  // Fallback for review: the canonical multi-agent-review.js.
  if (ctx.subcommand === "review") {
    const fallback = join(ctx.pluginRoot, "workflows", "multi-agent-review.js");
    if (existsSync(fallback)) return fallback;
  }
  return primary; // existsSync check at call site will report missing
}

function upsertField(content: string, key: string, value: string): string {
  const re = new RegExp(`^${escapeRegExp(key)}:.*$`, "m");
  const line = `${key}: ${value}`;
  if (re.test(content)) {
    return content.replace(re, line);
  }
  // Append to end with a leading newline if needed.
  const sep = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  return `${content}${sep}${line}\n`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
