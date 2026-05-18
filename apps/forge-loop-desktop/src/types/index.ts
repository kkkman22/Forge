export type TaskId = string;
export type RunId = string;

export type TaskStatus =
  | "queued"
  | "running"
  | "paused"
  | "awaiting_review"
  | "completed"
  | "failed";

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
  repo_path: string;
  branch_strategy: BranchStrategy;
  target: TaskTarget;
  tier?: "auto" | "light" | "standard" | "full";
  max_iterations?: number;
  max_budget_usd?: number;
  sleep_inhibit?: boolean;
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
