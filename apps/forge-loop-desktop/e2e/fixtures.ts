// Mock Tauri IPC for Playwright E2E tests
// Injected via vite config when E2E=true

const mockTasks = [
  {
    id: "task-1",
    title: "Add login page",
    repo_path: "/Users/test/project-a",
    branch_strategy: { type: "current_branch" },
    target: { type: "objective", text: "Build login with OAuth2" },
    tier: "standard",
    max_iterations: 50,
    max_budget_usd: null,
    sleep_inhibit: true,
    status: "queued",
    created_at: "2026-05-18T10:00:00Z",
    updated_at: "2026-05-18T10:00:00Z",
    executions: [],
    metadata: null,
  },
  {
    id: "task-2",
    title: "Fix pagination bug",
    repo_path: "/Users/test/project-b",
    branch_strategy: { type: "new_worktree", name: "fix/pagination" },
    target: { type: "spec_file", path: ".kiro/specs/pagination-fix.md" },
    tier: "light",
    max_iterations: null,
    max_budget_usd: null,
    sleep_inhibit: false,
    status: "running",
    created_at: "2026-05-18T09:00:00Z",
    updated_at: "2026-05-18T09:30:00Z",
    executions: [
      {
        run_id: "run-001",
        started_at: "2026-05-18T09:30:00Z",
        ended_at: null,
        exit_code: null,
        iterations: 12,
        outcome: "pending",
      },
    ],
    metadata: { current_branch: "fix/pagination", recent_specs: [] },
  },
  {
    id: "task-3",
    title: "Implement search",
    repo_path: "/Users/test/project-a",
    branch_strategy: { type: "current_branch" },
    target: { type: "objective", text: "Full-text search with Elasticsearch" },
    tier: "full",
    max_iterations: 100,
    max_budget_usd: 5.0,
    sleep_inhibit: true,
    status: "awaiting_review",
    created_at: "2026-05-17T14:00:00Z",
    updated_at: "2026-05-18T08:00:00Z",
    executions: [
      {
        run_id: "run-002",
        started_at: "2026-05-17T14:00:00Z",
        ended_at: "2026-05-18T08:00:00Z",
        exit_code: 0,
        iterations: 47,
        outcome: "success",
      },
    ],
    metadata: null,
  },
  {
    id: "task-4",
    title: "Refactor auth middleware",
    repo_path: "/Users/test/project-c",
    branch_strategy: { type: "current_branch" },
    target: { type: "objective", text: "Move to JWT sessions" },
    tier: "standard",
    max_iterations: 50,
    max_budget_usd: null,
    sleep_inhibit: false,
    status: "completed",
    created_at: "2026-05-16T10:00:00Z",
    updated_at: "2026-05-17T16:00:00Z",
    executions: [
      {
        run_id: "run-003",
        started_at: "2026-05-16T10:00:00Z",
        ended_at: "2026-05-17T16:00:00Z",
        exit_code: 0,
        iterations: 38,
        outcome: "success",
      },
    ],
    metadata: null,
  },
  {
    id: "task-5",
    title: "Add rate limiting",
    repo_path: "/Users/test/project-a",
    branch_strategy: { type: "current_branch" },
    target: { type: "objective", text: "Token bucket rate limiter" },
    tier: "light",
    max_iterations: 20,
    max_budget_usd: null,
    sleep_inhibit: false,
    status: "failed",
    created_at: "2026-05-15T08:00:00Z",
    updated_at: "2026-05-15T12:00:00Z",
    executions: [
      {
        run_id: "run-004",
        started_at: "2026-05-15T08:00:00Z",
        ended_at: "2026-05-15T12:00:00Z",
        exit_code: 1,
        iterations: 20,
        outcome: "failed",
      },
    ],
    metadata: null,
  },
];

let nextId = 100;
const handlers: Record<string, (...args: unknown[]) => unknown> = {
  list_tasks: () => [...mockTasks],
  create_task: ({ input }: { input: unknown }) => {
    const task = {
      ...(input as Record<string, unknown>),
      id: `task-${nextId++}`,
      status: "queued",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      executions: [],
      metadata: null,
    };
    mockTasks.push(task);
    return task;
  },
  update_task: ({ taskId, patch }: { taskId: string; patch: unknown }) => {
    const idx = mockTasks.findIndex((t) => t.id === taskId);
    if (idx !== -1) Object.assign(mockTasks[idx], patch);
    return mockTasks[idx];
  },
  delete_task: ({ taskId }: { taskId: string }) => {
    const idx = mockTasks.findIndex((t) => t.id === taskId);
    if (idx !== -1) mockTasks.splice(idx, 1);
  },
  start_task: ({ taskId }: { taskId: string }) => {
    const t = mockTasks.find((t) => t.id === taskId);
    if (t) t.status = "running";
  },
  stop_task: ({ taskId }: { taskId: string }) => {
    const t = mockTasks.find((t) => t.id === taskId);
    if (t) t.status = "paused";
  },
  retry_task: ({ taskId }: { taskId: string }) => {
    const t = mockTasks.find((t) => t.id === taskId);
    if (t) t.status = "queued";
    return true;
  },
  get_diff: () => "diff --git a/src/auth.ts b/src/auth.ts\n+ import { jwt } from 'jsonwebtoken';\n",
  approve_task: ({ taskId }: { taskId: string }) => {
    const t = mockTasks.find((t) => t.id === taskId);
    if (t) t.status = "completed";
  },
  reject_task: ({ taskId }: { taskId: string }) => {
    const t = mockTasks.find((t) => t.id === taskId);
    if (t) t.status = "queued";
  },
  get_recent_repos: () => ["/Users/test/project-a", "/Users/test/project-b"],
  get_auth_status: () => ({ mode: "claude_code_session", is_valid: true }),
  store_api_key: () => {},
  clear_credentials: () => {},
  export_diagnostics: () => "/tmp/forge-diagnostics.zip",
};

export async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const handler = handlers[cmd];
  if (handler) return handler(args || {}) as T;
  console.warn(`[mock] Unknown invoke: ${cmd}`);
  return undefined as T;
}

export async function listen(_event: string, _handler: (payload: unknown) => void): Promise<() => void> {
  return () => {};
}

// Mock dialog plugin
export async function open(_options: Record<string, unknown>): Promise<string | string[] | null> {
  return null;
}

// Mock notification plugin
export async function isPermissionGranted(): Promise<boolean> {
  return true;
}

export async function requestPermission(): Promise<string> {
  return "granted";
}

export function sendNotification(_options: { title: string; body: string }): void {
  // No-op in E2E
}
