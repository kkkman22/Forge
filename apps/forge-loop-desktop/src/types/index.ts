export type TaskId = string;
export type RunId = string;

export type TaskStatus =
  | { type: "queued" }
  | { type: "running"; run_id: string; started_at: string }
  | { type: "paused" }
  | { type: "awaiting_review"; run_id: string; completed_at: string }
  | { type: "completed"; run_id: string; completed_at: string }
  | { type: "failed"; run_id: string; error: string; failed_at: string };

export type TaskStatusLabel = "queued" | "running" | "paused" | "awaiting_review" | "completed" | "failed";

export function statusType(s: TaskStatus): TaskStatusLabel {
  return s.type;
}

const statusLabelMap: Record<TaskStatusLabel, string> = {
  queued: "排队中",
  running: "执行中",
  paused: "已暂停",
  awaiting_review: "待审核",
  completed: "已完成",
  failed: "失败",
};

export function statusLabel(s: TaskStatus): string {
  return statusLabelMap[s.type] || s.type;
}

export type BranchStrategy =
  | { type: "current_branch" }
  | { type: "new_worktree"; name: string }
  | { type: "existing_branch"; name: string };

export type TaskTarget =
  | { type: "objective"; text: string }
  | { type: "spec_file"; path: string };

export interface ExecutionRecord {
  run_id: RunId;
  started_at: string;
  ended_at: string | null;
  exit_code: number | null;
  iterations: number | null;
  outcome: "success" | "failed" | "aborted" | "pending";
  branch_name: string | null;
  worktree_path: string | null;
}

export interface Task {
  id: TaskId;
  title: string;
  repo_path: string;
  branch_strategy: BranchStrategy;
  target: TaskTarget;
  tier: "auto" | "light" | "standard" | "full" | null;
  max_iterations: number | null;
  max_budget_usd: number | null;
  sleep_inhibit: boolean;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  executions: ExecutionRecord[];
  metadata: TaskMetadata | null;
}

export interface TaskMetadata {
  current_branch: string;
  recent_specs: string[];
}

export interface TaskInput {
  title: string;
  repoPath: string;
  branchStrategy: BranchStrategy;
  target: TaskTarget;
  tier?: "auto" | "light" | "standard" | "full";
  maxIterations?: number;
  maxBudgetUsd?: number;
  sleepInhibit?: boolean;
}

export interface TaskStatusUpdate {
  task_id: TaskId;
  phase: string | null;
  iteration: number | null;
  latest_event: string | null;
  progress_summary: string | null;
}

export interface AuthStatus {
  mode: "none" | "api_key" | "claude_code_session";
  is_valid: boolean;
}

export interface SleepStatus {
  is_inhibited: boolean;
  sudoers_configured: boolean;
}
