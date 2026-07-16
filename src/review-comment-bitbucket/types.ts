export type Priority = "P0" | "P1" | "P2" | "P3";
export type FindingType = string;
export type LineType = "ADDED" | "REMOVED" | "CONTEXT";

export interface Finding {
  priority: Priority;
  finding_type: FindingType;
  file_path: string;
  line_number: number;
  line_type: LineType;
  message: string;
  suggestion?: string;
  suggestion_end_line?: number;
  source_layer: "spec-check" | "quality-check" | "security-check";
}

export interface TaskRecord {
  task_id: string;
  text: string;
  status: "OPEN" | "RESOLVED";
  marker_hash?: string;
  parent_comment_id?: string;
}

export interface CommentRecord {
  comment_id: string;
  file_path: string;
  line_number: number;
  text: string;
  marker_hash?: string;
}

export type Action =
  | { kind: "create"; finding: Finding }
  | { kind: "done"; task_id: string; comment_id?: string; finding_hash: string }
  | { kind: "reopen"; task_id: string; comment_id?: string; finding: Finding }
  | { kind: "skip-duplicate"; finding_hash: string; task_id?: string; reason?: string };

export interface ActionPlan {
  creates: Action[];
  dones: Action[];
  reopens: Action[];
  skips: Action[];
  has_p0_p1: boolean;
}

export interface ResolvedConfig {
  enabled: boolean;
  platform: "bitbucket";
  platform_override: "auto" | "bitbucket" | "none";
  p0_p1_strategy: "both" | "pr-task" | "inline-only";
  p2_strategy: "inline" | "none";
  p3_strategy: "none";
  request_changes_on_p0_p1: boolean;
  auto_reconcile_resolved: boolean;
  auto_reopen_regressed: boolean;
  comment_marker_prefix: string;
  rate_limit_interval_ms: number;
}

export type GateSkipReason =
  | "platform-disabled-by-config"
  | "platform-not-bitbucket"
  | "mcp-not-configured"
  | "override-but-mcp-missing"
  | "mcp-base-url-mismatch";

export type GateResult = { skip: false } | { skip: true; reason: GateSkipReason };

export interface GateInput {
  remoteUrl: string | null;
  platformOverride: "auto" | "bitbucket" | "none";
  mcpConfigured: boolean;
  mcpBaseUrl: string | null;
}

export interface PostContext {
  remoteUrl: string | null;
  mcpBaseUrl: string | null;
  mcpConfigured: boolean;
  runId: string;
}

export type PostFailureReason =
  | GateSkipReason
  | "disabled-by-cli"
  | "review-markdown-not-found"
  | "parse-error"
  | "current-state-fetch-failed";

export type PostResult =
  | { posted: false; reason: PostFailureReason }
  | { posted: true; plan_summary: PlanSummary; partial_failures?: ToolFailure[] };

export interface PlanSummary {
  creates: number;
  dones: number;
  reopens: number;
  skips: number;
  has_p0_p1: boolean;
}

export interface ToolFailure {
  finding_hash: string;
  tool_name: string;
  error_message: string;
  timestamp: number;
}

export interface FormatOutput {
  task_text: string;
  comment_text: string;
  marker: string;
  done_comment_text: string;
  reopen_comment_text: string;
}

// ---------------------------------------------------------------------------
// Bitbucket API response types (replaces `any`)
// ---------------------------------------------------------------------------

/** Shape of a PR task returned by the Bitbucket API. */
export interface BitbucketTaskResponse {
  id: number | string;
  content?: string;
  text?: string;
  state?: string;
  status?: string;
}

/** Shape of a PR comment returned by the Bitbucket API. */
export interface BitbucketCommentResponse {
  id: number | string;
  content?: { raw?: string };
  text?: string;
  path?: string;
  file_path?: string;
  line?: number;
  line_number?: number;
}

/** Shape of a PR response from the Bitbucket API. */
export interface BitbucketPrResponse {
  active_comments?: BitbucketCommentResponse[];
  comments?: BitbucketCommentResponse[];
}
