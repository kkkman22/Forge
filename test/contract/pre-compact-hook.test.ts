import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const HOOK = resolve(ROOT, "scripts/pre-compact-hook.mjs");
const FIXTURE_DIR = resolve(ROOT, ".test-fixture-pre-compact-hook");

function fixture(...paths: string[]): string {
  return join(FIXTURE_DIR, ...paths);
}

function runHook(env: Record<string, string> = {}): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  try {
    const stdout = execFileSync("node", [HOOK], {
      cwd: FIXTURE_DIR,
      timeout: 5000,
      encoding: "utf-8",
      env: { ...process.env, ...env },
    });
    return { exitCode: 0, stdout, stderr: "" };
  } catch (err: unknown) {
    const e = err as {
      status?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      exitCode: e.status ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

/**
 * Helper: scaffold a minimal .forge directory inside fixture dir
 * with given config values and progress content.
 */
function setupForgeEnv(opts: {
  configContent?: string;
  progressContent?: string;
  lastRestatement?: { spec: string; tasks_completed_count: number; timestamp: string };
  statusCurrentTask?: string;
}) {
  // .forge/config.md
  const configPath = fixture(".forge", "config.md");
  writeFileSync(
    configPath,
    opts.configContent ??
      `---\nforge_pre_compact_hook: on\nforge_pre_compact_threshold_tasks: 3\n---`,
  );

  // .forge/status.md with current_task
  if (opts.statusCurrentTask) {
    writeFileSync(
      fixture(".forge", "status.md"),
      `---\ncurrent_task: "${opts.statusCurrentTask}"\n---`,
    );
  }

  // .forge/progress/<spec>.md
  if (opts.progressContent && opts.statusCurrentTask) {
    writeFileSync(
      fixture(".forge", "progress", `${opts.statusCurrentTask}.md`),
      opts.progressContent,
    );
  }

  // .forge/state/last-restatement.json
  if (opts.lastRestatement) {
    writeFileSync(
      fixture(".forge", "state", "last-restatement.json"),
      JSON.stringify(opts.lastRestatement, null, 2),
    );
  }
}

describe("PreCompact hook (R13)", () => {
  beforeEach(() => {
    // Clean fixture dir
    if (existsSync(FIXTURE_DIR)) rmSync(FIXTURE_DIR, { recursive: true });
    mkdirSync(fixture(".forge", "progress"), { recursive: true });
    mkdirSync(fixture(".forge", "state"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(FIXTURE_DIR)) rmSync(FIXTURE_DIR, { recursive: true });
  });

  // AC1: Blocks when N tasks completed since last restate
  it("blocks compression when completed tasks exceed threshold since last restate", () => {
    setupForgeEnv({
      statusCurrentTask: "my-feature",
      progressContent: [
        "## Phase 1",
        "- [x] T1: do thing",
        "- [x] T2: do another",
        "- [x] T3: do more",
        "- [x] T4: do extra",
        "- [ ] T5: not done",
      ].join("\n"),
      lastRestatement: {
        spec: "my-feature",
        tasks_completed_count: 1,
        timestamp: "2026-05-28T10:00:00Z",
      },
    });

    const result = runHook();
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("restate");
    expect(result.stderr).toContain("/compact");
  });

  // AC2: Allows when just restated (count matches)
  it("allows compression when tasks match last restate count", () => {
    setupForgeEnv({
      statusCurrentTask: "my-feature",
      progressContent: [
        "## Phase 1",
        "- [x] T1: do thing",
        "- [x] T2: do another",
        "- [ ] T3: not done",
      ].join("\n"),
      lastRestatement: {
        spec: "my-feature",
        tasks_completed_count: 2,
        timestamp: "2026-05-28T10:00:00Z",
      },
    });

    const result = runHook();
    expect(result.exitCode).toBe(0);
  });

  // AC3: Allows when below threshold
  it("allows compression when tasks below threshold since last restate", () => {
    setupForgeEnv({
      statusCurrentTask: "my-feature",
      progressContent: [
        "## Phase 1",
        "- [x] T1: do thing",
        "- [x] T2: do another",
        "- [ ] T3: not done",
      ].join("\n"),
      lastRestatement: {
        spec: "my-feature",
        tasks_completed_count: 1,
        timestamp: "2026-05-28T10:00:00Z",
      },
    });

    const result = runHook();
    expect(result.exitCode).toBe(0);
  });

  // AC4: Silent pass when progress file doesn't exist
  it("passes silently when progress file does not exist", () => {
    // Only config and status, no progress file
    setupForgeEnv({
      statusCurrentTask: "nonexistent-spec",
    });

    const result = runHook();
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("");
  });

  // AC5: Silent pass when status.md doesn't exist
  it("passes silently when status.md does not exist", () => {
    setupForgeEnv({});

    // Remove status.md to simulate missing status
    const statusPath = fixture(".forge", "status.md");
    if (existsSync(statusPath)) rmSync(statusPath);

    const result = runHook();
    expect(result.exitCode).toBe(0);
  });

  // AC6: Respects forge_pre_compact_hook: off config
  it("passes silently when hook is disabled via config", () => {
    setupForgeEnv({
      configContent:
        "---\nforge_pre_compact_hook: off\nforge_pre_compact_threshold_tasks: 3\n---",
      statusCurrentTask: "my-feature",
      progressContent: [
        "## Phase 1",
        "- [x] T1: do thing",
        "- [x] T2: do another",
        "- [x] T3: do more",
        "- [x] T4: do extra",
      ].join("\n"),
      lastRestatement: {
        spec: "my-feature",
        tasks_completed_count: 0,
        timestamp: "2026-05-28T10:00:00Z",
      },
    });

    const result = runHook();
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
  });

  // AC7: Uses correct threshold from config
  it("respects custom threshold from config", () => {
    setupForgeEnv({
      configContent:
        "---\nforge_pre_compact_hook: on\nforge_pre_compact_threshold_tasks: 5\n---",
      statusCurrentTask: "my-feature",
      progressContent: [
        "## Phase 1",
        "- [x] T1",
        "- [x] T2",
        "- [x] T3",
        "- [x] T4",
        "- [ ] T5",
      ].join("\n"),
      lastRestatement: {
        spec: "my-feature",
        tasks_completed_count: 0,
        timestamp: "2026-05-28T10:00:00Z",
      },
    });

    // 4 completed - 0 restated = 4, threshold is 5 => should pass
    const result = runHook();
    expect(result.exitCode).toBe(0);
  });

  // AC8: Blocks at custom threshold
  it("blocks when tasks reach custom threshold", () => {
    setupForgeEnv({
      configContent:
        "---\nforge_pre_compact_hook: on\nforge_pre_compact_threshold_tasks: 2\n---",
      statusCurrentTask: "my-feature",
      progressContent: [
        "## Phase 1",
        "- [x] T1",
        "- [x] T2",
        "- [x] T3",
        "- [ ] T4",
      ].join("\n"),
      lastRestatement: {
        spec: "my-feature",
        tasks_completed_count: 0,
        timestamp: "2026-05-28T10:00:00Z",
      },
    });

    // 3 completed - 0 restated = 3, threshold is 2 => should block
    const result = runHook();
    expect(result.exitCode).toBe(2);
  });

  // AC9: Passes when last-restatement.json does not exist (no restate ever done)
  it("passes when last-restatement.json does not exist but completed tasks below threshold", () => {
    setupForgeEnv({
      statusCurrentTask: "my-feature",
      progressContent: [
        "## Phase 1",
        "- [x] T1",
        "- [x] T2",
        "- [ ] T3",
      ].join("\n"),
    });

    // 2 completed, no restate file => treat as 0 restated count, threshold 3 => pass
    const result = runHook();
    expect(result.exitCode).toBe(0);
  });

  // AC10: Blocks when last-restatement.json does not exist and many tasks done
  it("blocks when last-restatement.json missing and completed tasks exceed threshold", () => {
    setupForgeEnv({
      statusCurrentTask: "my-feature",
      progressContent: [
        "## Phase 1",
        "- [x] T1",
        "- [x] T2",
        "- [x] T3",
        "- [x] T4",
      ].join("\n"),
    });

    // 4 completed, no restate => 4 - 0 = 4 >= 3 => block
    const result = runHook();
    expect(result.exitCode).toBe(2);
  });

  // AC11: Supports Status: DONE / Status: COMPLETE markers too
  it("counts Status: DONE and Status: COMPLETE markers as completed tasks", () => {
    setupForgeEnv({
      statusCurrentTask: "my-feature",
      progressContent: [
        "### Task 1",
        "- Status: DONE",
        "### Task 2",
        "- Status: COMPLETE",
        "### Task 3",
        "- Status: DONE",
        "### Task 4",
        "- Status: PENDING",
      ].join("\n"),
      lastRestatement: {
        spec: "my-feature",
        tasks_completed_count: 0,
        timestamp: "2026-05-28T10:00:00Z",
      },
    });

    // 3 completed - 0 restated = 3 >= 3 => block
    const result = runHook();
    expect(result.exitCode).toBe(2);
  });

  // AC12: Output format matches spec (Chinese message + steps)
  it("outputs correct Chinese error message with steps on block", () => {
    setupForgeEnv({
      statusCurrentTask: "my-feature",
      progressContent: [
        "## Phase 1",
        "- [x] T1",
        "- [x] T2",
        "- [x] T3",
        "- [x] T4",
      ].join("\n"),
      lastRestatement: {
        spec: "my-feature",
        tasks_completed_count: 0,
        timestamp: "2026-05-28T10:00:00Z",
      },
    });

    const result = runHook();
    expect(result.stderr).toContain("请先运行 progress 更新");
    expect(result.stderr).toContain("执行步骤");
    expect(result.stderr).toContain("重读");
    expect(result.stderr).toContain("更新 .forge/state/last-restatement.json");
    expect(result.stderr).toContain("重试 /compact");
  });

  // AC13: Ignores last-restatement.json that references a different spec
  it("ignores last-restatement for a different spec and treats as 0 restated", () => {
    setupForgeEnv({
      statusCurrentTask: "my-feature",
      progressContent: [
        "## Phase 1",
        "- [x] T1",
        "- [x] T2",
        "- [x] T3",
        "- [x] T4",
      ].join("\n"),
      lastRestatement: {
        spec: "other-feature", // different spec
        tasks_completed_count: 10,
        timestamp: "2026-05-28T10:00:00Z",
      },
    });

    // 4 completed, restated spec doesn't match => count as 0 restated, 4 >= 3 => block
    const result = runHook();
    expect(result.exitCode).toBe(2);
  });
});
