import type {
  CommentRecord,
  Finding,
  PostContext,
  PostResult,
  ResolvedConfig,
  TaskRecord,
  ToolFailure,
} from "./types.js";
import { checkPlatformGate } from "./platform-gate.js";
import { computeFindingHash, buildMarker, extractMarker } from "./finding-hash.js";
import { formatFinding } from "./format.js";
import { reconcile } from "./reconcile.js";
import { parseReviewMarkdown } from "./parse-review.js";
import { recordSkip } from "./skip-trace.js";
import { recordPartialFailures, appendRunMetrics } from "./observability.js";
import { applyCliOverrides } from "./cli.js";

export interface BitbucketClient {
  list_pr_tasks(params: { pull_request_id: string }): Promise<any[]>;
  get_pull_request(params: { pull_request_id: string }): Promise<any>;
  get_pull_request_diff(params: { pull_request_id: string }): Promise<string>;
  create_pr_task(params: { pull_request_id: string; text: string; anchor?: string }): Promise<{ id: string }>;
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

interface PostOptions {
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
  if (options?.argv) {
    config = applyCliOverrides(config, options.argv);
  }
  if (!config.enabled) {
    if (baseDir) {
      await recordSkip(reviewMarkdownPath, "platform-disabled-by-config" as any, ctx).catch(() => {});
    }
    return { posted: false, reason: "disabled-by-cli" };
  }

  // 1. Platform gate
  const gate = checkPlatformGate({
    remoteUrl: ctx.remoteUrl,
    platformOverride: config.platform_override,
    mcpConfigured: ctx.mcpConfigured,
    mcpBaseUrl: ctx.mcpBaseUrl,
  });

  if (gate.skip) {
    if (baseDir) {
      await recordSkip(reviewMarkdownPath, gate.reason!, ctx).catch(() => {});
    }
    return { posted: false, reason: gate.reason };
  }

  // 2. Parse review markdown
  let allFindings: Finding[];
  if (_testFindings !== undefined) {
    allFindings = _testFindings;
  } else {
    try {
      allFindings = await parseReviewMarkdown(reviewMarkdownPath);
    } catch (e: any) {
      return { posted: false, reason: "parse-error" };
    }
  }
  const targets = allFindings.filter((f) => f.priority !== "P3");

  // 3. Fetch existing tasks and comments
  const [rawTasks, rawPr] = await Promise.all([
    bitbucket.list_pr_tasks({ pull_request_id: pullRequestId }),
    bitbucket.get_pull_request({ pull_request_id: pullRequestId }),
  ]);

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
  const failures: ToolFailure[] = [];

  // Execute creates for P0/P1
  for (const action of plan.creates) {
    if (action.kind !== "create") continue;
    const finding = action.finding;
    if (finding.priority !== "P0" && finding.priority !== "P1") continue;

    const fmt = formatFinding(finding, ctx.runId, prefix);

    if (config.p0_p1_strategy === "both" || config.p0_p1_strategy === "pr-task") {
      try {
        await bitbucket.create_pr_task({
          pull_request_id: pullRequestId,
          text: fmt.task_text,
        });
      } catch (e: any) {
        failures.push({
          finding_hash: computeFindingHash(finding),
          tool_name: "create_pr_task",
          error_message: e.message,
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
      } catch (e: any) {
        failures.push({
          finding_hash: computeFindingHash(finding),
          tool_name: "add_comment",
          error_message: e.message,
          timestamp: Date.now(),
        });
      }
    }

    if (config.rate_limit_interval_ms > 0) {
      await sleep(config.rate_limit_interval_ms);
    }
  }

  // Execute reopens for P0/P1
  for (const action of plan.reopens) {
    if (action.kind !== "reopen") continue;

    try {
      await bitbucket.set_pr_task_status({ task_id: action.task_id, done: false });
    } catch (e: any) {
      failures.push({
        finding_hash: action.finding ? computeFindingHash(action.finding) : action.task_id,
        tool_name: "set_pr_task_status",
        error_message: e.message,
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
      } catch (e: any) {
        failures.push({
          finding_hash: computeFindingHash(action.finding),
          tool_name: "add_comment",
          error_message: e.message,
          timestamp: Date.now(),
        });
      }
    }

    if (config.rate_limit_interval_ms > 0) {
      await sleep(config.rate_limit_interval_ms);
    }
  }

  // Execute dones
  for (const action of plan.dones) {
    if (action.kind !== "done") continue;

    try {
      await bitbucket.set_pr_task_status({ task_id: action.task_id, done: true });
    } catch (e: any) {
      failures.push({
        finding_hash: action.finding_hash,
        tool_name: "set_pr_task_status",
        error_message: e.message,
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
    } catch (e: any) {
      failures.push({
        finding_hash: action.finding_hash,
        tool_name: "add_comment",
        error_message: e.message,
        timestamp: Date.now(),
      });
    }

    if (config.rate_limit_interval_ms > 0) {
      await sleep(config.rate_limit_interval_ms);
    }
  }

  // Execute creates for P2
  for (const action of plan.creates) {
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
      } catch (e: any) {
        failures.push({
          finding_hash: computeFindingHash(action.finding),
          tool_name: "add_comment",
          error_message: e.message,
          timestamp: Date.now(),
        });
      }
    }

    if (config.rate_limit_interval_ms > 0) {
      await sleep(config.rate_limit_interval_ms);
    }
  }

  // 6. set_review_status if P0/P1
  if (plan.has_p0_p1 && config.request_changes_on_p0_p1) {
    const p0Count = targets.filter((f) => f.priority === "P0").length;
    const p1Count = targets.filter((f) => f.priority === "P1").length;
    try {
      await bitbucket.set_review_status({
        pull_request_id: pullRequestId,
        request_changes: true,
        comment: `Forge review found P0=${p0Count} P1=${p1Count} run=${ctx.runId}`,
      });
    } catch (e: any) {
      failures.push({
        finding_hash: "set_review_status",
        tool_name: "set_review_status",
        error_message: e.message,
        timestamp: Date.now(),
      });
    }
  }

  // 7. Persist side-effects
  if (baseDir) {
    if (failures.length > 0) {
      await recordPartialFailures(failures, baseDir).catch(() => {});
    }
    await appendRunMetrics({
      run_id: ctx.runId,
      post_enabled: true,
      gate_skipped_reason: null,
      creates: plan.creates.length,
      dones: plan.dones.length,
      reopens: plan.reopens.length,
      skips: plan.skips.length,
      partial_failures: failures.length,
      set_review_status_called: plan.has_p0_p1 && config.request_changes_on_p0_p1,
      total_duration_ms: Date.now() - startTime,
    }, baseDir).catch(() => {});
  }

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

function extractForgeTasks(raw: any[], prefix: string): TaskRecord[] {
  return raw
    .map((t: any) => {
      const text = t.content || t.text || "";
      const markerHash = extractMarker(text, prefix);
      return {
        task_id: String(t.id),
        text,
        status: (t.state || t.status || "OPEN").toUpperCase() as "OPEN" | "RESOLVED",
        marker_hash: markerHash ?? undefined,
      };
    })
    .filter((t) => t.marker_hash !== undefined);
}

function extractForgeComments(rawPr: any, prefix: string): CommentRecord[] {
  const comments = rawPr?.active_comments ?? rawPr?.comments ?? [];
  return comments
    .map((c: any) => {
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
    .filter((c) => c.marker_hash !== undefined);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
