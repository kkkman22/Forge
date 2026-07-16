import { applyCliOverrides } from "./cli.js";
import { buildMarker, computeFindingHash, extractMarker } from "./finding-hash.js";
import { formatFinding } from "./format.js";
import { appendRunMetrics, recordPartialFailures } from "./observability.js";
import { parseReviewMarkdown, ReviewMarkdownNotFoundError } from "./parse-review.js";
import { checkPlatformGate } from "./platform-gate.js";
import { reconcile } from "./reconcile.js";
import { recordSkip } from "./skip-trace.js";
import type {
  BitbucketPrResponse,
  BitbucketTaskResponse,
  CommentRecord,
  Finding,
  GateSkipReason,
  PostContext,
  PostFailureReason,
  PostResult,
  ResolvedConfig,
  TaskRecord,
  ToolFailure,
} from "./types.js";

export interface BitbucketClient {
  list_pr_tasks(params: { pull_request_id: string }): Promise<BitbucketTaskResponse[]>;
  get_pull_request(params: { pull_request_id: string }): Promise<BitbucketPrResponse>;
  get_pull_request_diff(params: { pull_request_id: string }): Promise<string>;
  create_pr_task(params: {
    pull_request_id: string;
    text: string;
    anchor?: string;
  }): Promise<{ id: string }>;
  set_pr_task_status(params: { task_id: string; done: boolean }): Promise<void>;
  add_comment(params: {
    pull_request_id: string;
    file_path: string;
    line_number: number;
    line_type: string;
    comment_text: string;
    suggestion?: string;
    suggestion_end_line?: number;
    parent_comment_id?: string;
  }): Promise<{ id: string }>;
  set_review_status(params: {
    pull_request_id: string;
    request_changes: boolean;
    comment: string;
  }): Promise<void>;
}

const VALID_TASK_STATUSES = new Set(["OPEN", "RESOLVED"]);

export interface PostOptions {
  baseDir?: string;
  argv?: string[];
}

export async function postReviewToBitbucket(
  reviewMarkdownPath: string,
  pullRequestId: string,
  config: ResolvedConfig,
  ctx: PostContext,
  bitbucket: BitbucketClient,
  _testFindings?: Finding[],
  options?: PostOptions,
): Promise<PostResult> {
  const startTime = Date.now();
  const baseDir = options?.baseDir;

  // 0. CLI overrides
  // Audit P3-3 (2026-07-16): capture whether the config was already disabled
  // before CLI overrides, so the skip reason is attributed correctly. A config
  // disable (platform_override:"none" etc.) is platform-driven; only an actual
  // --no-post-comments argv is CLI-driven. Previously the metrics recorded
  // "platform-disabled-by-config" while the return value said "disabled-by-cli"
  // regardless of cause — observability contradicted itself.
  const configDisabledBeforeArgv = !config.enabled;
  if (options?.argv) {
    config = applyCliOverrides(config, options.argv);
  }
  if (!config.enabled) {
    const disabledByCli = configDisabledBeforeArgv === false;
    // recordSkip traces platform/gate-level skips; a CLI flag disable is not a
    // gate skip, so only trace the platform-driven case (matches GateSkipReason).
    if (disabledByCli) {
      const reason: PostFailureReason = "disabled-by-cli";
      await persistMetrics(baseDir, ctx, {
        posted: false,
        post_enabled: false,
        gate_skipped_reason: reason,
        creates: 0,
        dones: 0,
        reopens: 0,
        skips: 0,
        partial_failures: 0,
        set_review_status_called: false,
        total_duration_ms: Date.now() - startTime,
      });
      return { posted: false, reason };
    }
    const reason: GateSkipReason = "platform-disabled-by-config";
    await persistSideEffects(baseDir, () => recordSkip(reviewMarkdownPath, reason, ctx));
    await persistMetrics(baseDir, ctx, {
      posted: false,
      post_enabled: false,
      gate_skipped_reason: reason,
      creates: 0,
      dones: 0,
      reopens: 0,
      skips: 0,
      partial_failures: 0,
      set_review_status_called: false,
      total_duration_ms: Date.now() - startTime,
    });
    return { posted: false, reason };
  }

  // 1. Platform gate
  const gate = checkPlatformGate({
    remoteUrl: ctx.remoteUrl,
    platformOverride: config.platform_override,
    mcpConfigured: ctx.mcpConfigured,
    mcpBaseUrl: ctx.mcpBaseUrl,
  });

  if (gate.skip) {
    const reason = gate.reason ?? "";
    await persistSideEffects(baseDir, () => recordSkip(reviewMarkdownPath, reason, ctx));
    await persistMetrics(baseDir, ctx, {
      posted: false,
      post_enabled: true,
      gate_skipped_reason: reason,
      creates: 0,
      dones: 0,
      reopens: 0,
      skips: 0,
      partial_failures: 0,
      set_review_status_called: false,
      total_duration_ms: Date.now() - startTime,
    });
    return { posted: false, reason };
  }

  // 2. Parse review markdown
  let allFindings: Finding[];
  if (_testFindings !== undefined) {
    allFindings = _testFindings;
  } else {
    try {
      allFindings = await parseReviewMarkdown(reviewMarkdownPath);
    } catch (e: unknown) {
      const reason: PostFailureReason =
        e instanceof ReviewMarkdownNotFoundError ? "review-markdown-not-found" : "parse-error";
      await persistMetrics(baseDir, ctx, {
        posted: false,
        post_enabled: true,
        gate_skipped_reason: null,
        creates: 0,
        dones: 0,
        reopens: 0,
        skips: 0,
        partial_failures: 0,
        set_review_status_called: false,
        total_duration_ms: Date.now() - startTime,
      });
      return { posted: false, reason };
    }
  }
  const targets = allFindings.filter((f) => f.priority !== "P3");

  // 3. Fetch existing tasks and comments (allSettled for resilience)
  const [rawTasksResult, rawPrResult] = await Promise.allSettled([
    bitbucket.list_pr_tasks({ pull_request_id: pullRequestId }),
    bitbucket.get_pull_request({ pull_request_id: pullRequestId }),
  ]);

  const failures: ToolFailure[] = [];

  if (rawTasksResult.status === "rejected") {
    failures.push({
      finding_hash: "list_pr_tasks",
      tool_name: "list_pr_tasks",
      error_message: String(rawTasksResult.reason),
      timestamp: Date.now(),
    });
  }
  if (rawPrResult.status === "rejected") {
    failures.push({
      finding_hash: "get_pull_request",
      tool_name: "get_pull_request",
      error_message: String(rawPrResult.reason),
      timestamp: Date.now(),
    });
  }

  // Audit P2-4 (2026-07-16): fail-closed. If we cannot see the current tasks /
  // comments on the PR (transient API error, timeout, 5xx), the reconcile would
  // treat the PR as empty and re-post every finding — duplicating tasks and
  // comments, doubling on each retry. The resilience design must not manufacture
  // spam. Abort instead of posting against an unknown baseline.
  if (rawTasksResult.status === "rejected" || rawPrResult.status === "rejected") {
    const reason: PostFailureReason = "current-state-fetch-failed";
    await persistMetrics(baseDir, ctx, {
      posted: false,
      post_enabled: true,
      gate_skipped_reason: null,
      creates: 0,
      dones: 0,
      reopens: 0,
      skips: 0,
      partial_failures: failures.length,
      set_review_status_called: false,
      total_duration_ms: Date.now() - startTime,
    });
    return { posted: false, reason };
  }

  const rawTasks = rawTasksResult.value;
  const rawPr = rawPrResult.value;

  const prefix = config.comment_marker_prefix;
  const existingTasks = extractForgeTasks(rawTasks, prefix);
  const existingComments = extractForgeComments(rawPr, prefix);

  // 4. Reconcile
  const plan = reconcile({
    currentFindings: targets,
    existingTasks,
    existingComments,
    autoReconcileResolved: config.auto_reconcile_resolved,
    autoReopenRegressed: config.auto_reopen_regressed,
    p0_p1_strategy: config.p0_p1_strategy,
  });

  // 5. Execute plan
  await executeCreatesP0P1(failures, plan.creates, pullRequestId, config, ctx, bitbucket, prefix);
  await executeReopens(failures, plan.reopens, pullRequestId, config, ctx, bitbucket, prefix);
  await executeDones(failures, plan.dones, pullRequestId, config, ctx, bitbucket, prefix);
  await executeCreatesP2(failures, plan.creates, pullRequestId, config, ctx, bitbucket, prefix);

  // 6. set_review_status if P0/P1
  let setReviewStatusCalled = false;
  if (plan.has_p0_p1 && config.request_changes_on_p0_p1) {
    setReviewStatusCalled = true;
    const p0Count = targets.filter((f) => f.priority === "P0").length;
    const p1Count = targets.filter((f) => f.priority === "P1").length;
    try {
      await bitbucket.set_review_status({
        pull_request_id: pullRequestId,
        request_changes: true,
        comment: `Forge review found P0=${p0Count} P1=${p1Count} run=${ctx.runId}`,
      });
    } catch (e: unknown) {
      failures.push({
        finding_hash: "set_review_status",
        tool_name: "set_review_status",
        error_message: e instanceof Error ? e.message : String(e),
        timestamp: Date.now(),
      });
    }
  }

  // 7. Persist side-effects
  if (baseDir && failures.length > 0) {
    await persistSideEffects(baseDir, () => recordPartialFailures(failures, baseDir));
  }
  await persistMetrics(baseDir, ctx, {
    posted: true,
    post_enabled: true,
    gate_skipped_reason: null,
    creates: plan.creates.length,
    dones: plan.dones.length,
    reopens: plan.reopens.length,
    skips: plan.skips.length,
    partial_failures: failures.length,
    set_review_status_called: setReviewStatusCalled,
    total_duration_ms: Date.now() - startTime,
  });

  return {
    posted: true,
    plan_summary: {
      creates: plan.creates.length,
      dones: plan.dones.length,
      reopens: plan.reopens.length,
      skips: plan.skips.length,
      has_p0_p1: plan.has_p0_p1,
    },
    ...(failures.length > 0 ? { partial_failures: failures } : {}),
  };
}

// --- Executor functions ---

async function executeCreatesP0P1(
  failures: ToolFailure[],
  actions: import("./types.js").Action[],
  pullRequestId: string,
  config: ResolvedConfig,
  ctx: PostContext,
  bitbucket: BitbucketClient,
  prefix: string,
): Promise<void> {
  for (const action of actions) {
    if (action.kind !== "create") continue;
    const finding = action.finding;
    if (finding.priority !== "P0" && finding.priority !== "P1") continue;

    const fmt = formatFinding(finding, ctx.runId, prefix);

    if (config.p0_p1_strategy === "both" || config.p0_p1_strategy === "pr-task") {
      try {
        await bitbucket.create_pr_task({ pull_request_id: pullRequestId, text: fmt.task_text });
      } catch (e: unknown) {
        failures.push({
          finding_hash: computeFindingHash(finding),
          tool_name: "create_pr_task",
          error_message: e instanceof Error ? e.message : String(e),
          timestamp: Date.now(),
        });
      }
    }

    if (config.p0_p1_strategy === "both" || config.p0_p1_strategy === "inline-only") {
      try {
        await bitbucket.add_comment({
          pull_request_id: pullRequestId,
          file_path: finding.file_path,
          line_number: finding.line_number,
          line_type: finding.line_type,
          comment_text: fmt.comment_text,
          suggestion: finding.suggestion,
          suggestion_end_line: finding.suggestion_end_line,
        });
      } catch (e: unknown) {
        failures.push({
          finding_hash: computeFindingHash(finding),
          tool_name: "add_comment",
          error_message: e instanceof Error ? e.message : String(e),
          timestamp: Date.now(),
        });
      }
    }

    if (config.rate_limit_interval_ms > 0) await sleep(config.rate_limit_interval_ms);
  }
}

async function executeReopens(
  failures: ToolFailure[],
  actions: import("./types.js").Action[],
  pullRequestId: string,
  config: ResolvedConfig,
  ctx: PostContext,
  bitbucket: BitbucketClient,
  prefix: string,
): Promise<void> {
  for (const action of actions) {
    if (action.kind !== "reopen") continue;

    try {
      await bitbucket.set_pr_task_status({ task_id: action.task_id, done: false });
    } catch (e: unknown) {
      failures.push({
        finding_hash: action.finding ? computeFindingHash(action.finding) : action.task_id,
        tool_name: "set_pr_task_status",
        error_message: e instanceof Error ? e.message : String(e),
        timestamp: Date.now(),
      });
      continue;
    }

    if (action.finding) {
      const fmt = formatFinding(action.finding, ctx.runId, prefix);
      try {
        await bitbucket.add_comment({
          pull_request_id: pullRequestId,
          file_path: action.finding.file_path,
          line_number: action.finding.line_number,
          line_type: action.finding.line_type,
          comment_text: fmt.reopen_comment_text,
          parent_comment_id: action.comment_id,
        });
      } catch (e: unknown) {
        failures.push({
          finding_hash: computeFindingHash(action.finding),
          tool_name: "add_comment",
          error_message: e instanceof Error ? e.message : String(e),
          timestamp: Date.now(),
        });
      }
    }

    if (config.rate_limit_interval_ms > 0) await sleep(config.rate_limit_interval_ms);
  }
}

async function executeDones(
  failures: ToolFailure[],
  actions: import("./types.js").Action[],
  pullRequestId: string,
  config: ResolvedConfig,
  ctx: PostContext,
  bitbucket: BitbucketClient,
  prefix: string,
): Promise<void> {
  for (const action of actions) {
    if (action.kind !== "done") continue;

    try {
      await bitbucket.set_pr_task_status({ task_id: action.task_id, done: true });
    } catch (e: unknown) {
      failures.push({
        finding_hash: action.finding_hash,
        tool_name: "set_pr_task_status",
        error_message: e instanceof Error ? e.message : String(e),
        timestamp: Date.now(),
      });
      continue;
    }

    try {
      await bitbucket.add_comment({
        pull_request_id: pullRequestId,
        file_path: "",
        line_number: 0,
        line_type: "CONTEXT",
        comment_text: `Forge auto-resolved (no longer present in review ${ctx.runId}). ${buildMarker(prefix, action.finding_hash)}`,
        parent_comment_id: action.comment_id,
      });
    } catch (e: unknown) {
      failures.push({
        finding_hash: action.finding_hash,
        tool_name: "add_comment",
        error_message: e instanceof Error ? e.message : String(e),
        timestamp: Date.now(),
      });
    }

    if (config.rate_limit_interval_ms > 0) await sleep(config.rate_limit_interval_ms);
  }
}

async function executeCreatesP2(
  failures: ToolFailure[],
  actions: import("./types.js").Action[],
  pullRequestId: string,
  config: ResolvedConfig,
  ctx: PostContext,
  bitbucket: BitbucketClient,
  prefix: string,
): Promise<void> {
  for (const action of actions) {
    if (action.kind !== "create") continue;
    if (action.finding.priority !== "P2") continue;

    if (config.p2_strategy === "inline") {
      const fmt = formatFinding(action.finding, ctx.runId, prefix);
      try {
        await bitbucket.add_comment({
          pull_request_id: pullRequestId,
          file_path: action.finding.file_path,
          line_number: action.finding.line_number,
          line_type: action.finding.line_type,
          comment_text: fmt.comment_text,
          suggestion: action.finding.suggestion,
          suggestion_end_line: action.finding.suggestion_end_line,
        });
      } catch (e: unknown) {
        failures.push({
          finding_hash: computeFindingHash(action.finding),
          tool_name: "add_comment",
          error_message: e instanceof Error ? e.message : String(e),
          timestamp: Date.now(),
        });
      }
    }

    if (config.rate_limit_interval_ms > 0) await sleep(config.rate_limit_interval_ms);
  }
}

// --- Helpers ---

async function persistSideEffects(
  baseDir: string | undefined,
  fn: () => Promise<void>,
): Promise<void> {
  if (!baseDir) return;
  try {
    await fn();
  } catch (e: unknown) {
    console.warn("Side-effect persistence failed:", e instanceof Error ? e.message : String(e));
  }
}

async function persistMetrics(
  baseDir: string | undefined,
  ctx: PostContext,
  params: {
    posted: boolean;
    post_enabled: boolean;
    gate_skipped_reason: string | null;
    creates: number;
    dones: number;
    reopens: number;
    skips: number;
    partial_failures: number;
    set_review_status_called: boolean;
    total_duration_ms: number;
  },
): Promise<void> {
  if (!baseDir) return;
  try {
    await appendRunMetrics({ run_id: ctx.runId, ...params }, baseDir);
  } catch (e: unknown) {
    console.warn("Metrics persistence failed:", e instanceof Error ? e.message : String(e));
  }
}

function extractForgeTasks(raw: BitbucketTaskResponse[], prefix: string): TaskRecord[] {
  return raw
    .map((t) => {
      const text = t.content || t.text || "";
      const markerHash = extractMarker(text, prefix);
      const rawStatus = (t.state || t.status || "OPEN").toUpperCase();
      return {
        task_id: String(t.id),
        text,
        // Audit P3-3 (2026-07-16): an unrecognized task status previously
        // defaulted to "RESOLVED", which could mark a genuinely OPEN task as
        // resolved and trigger a spurious reopen under autoReopenRegressed.
        // Default to "OPEN" — a skipped duplicate is harmless, a false reopen
        // is noise the user didn't ask for.
        status: VALID_TASK_STATUSES.has(rawStatus) ? (rawStatus as "OPEN" | "RESOLVED") : "OPEN",
        marker_hash: markerHash ?? undefined,
      };
    })
    .filter((t) => t.marker_hash !== undefined);
}

function extractForgeComments(rawPr: BitbucketPrResponse, prefix: string): CommentRecord[] {
  const comments = rawPr?.active_comments ?? rawPr?.comments ?? [];
  return comments
    .map((c) => {
      const text = c.content?.raw || c.text || "";
      const markerHash = extractMarker(text, prefix);
      return {
        comment_id: String(c.id),
        file_path: c.path || c.file_path || "",
        line_number: c.line || c.line_number || 0,
        text,
        marker_hash: markerHash ?? undefined,
      };
    })
    .filter((c: CommentRecord) => c.marker_hash !== undefined);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
