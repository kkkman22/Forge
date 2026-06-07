import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const HOOK = resolve(ROOT, "scripts/hook-precompact.sh");
const FIXTURE_DIR = resolve(ROOT, ".test-fixture-precompact-restate");

function fixture(...paths: string[]): string {
  return join(FIXTURE_DIR, ...paths);
}

function runHook(): { exitCode: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("bash", [HOOK], {
      cwd: FIXTURE_DIR,
      timeout: 5000,
      encoding: "utf-8",
    });
    return { exitCode: 0, stdout, stderr: "" };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      exitCode: e.status ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

function setupForgeEnv(opts: {
  restateReminder?: string;
  restateThreshold?: number;
  progressContent?: string;
  statusCurrentTask?: string;
}) {
  const configContent = [
    "---",
    `forge_compact_restate_reminder: ${opts.restateReminder ?? "on"}`,
    `forge_compact_restate_threshold_tasks: ${opts.restateThreshold ?? 3}`,
    "---",
  ].join("\n");

  writeFileSync(fixture(".forge", "config.md"), configContent);

  if (opts.statusCurrentTask) {
    writeFileSync(
      fixture(".forge", "status.md"),
      `---\ncurrent_task: "${opts.statusCurrentTask}"\nphase: "build"\n---`,
    );
  }

  if (opts.progressContent && opts.statusCurrentTask) {
    writeFileSync(
      fixture(".forge", "progress", `${opts.statusCurrentTask}.md`),
      opts.progressContent,
    );
  }
}

describe("PreCompact restate reminder", () => {
  beforeEach(() => {
    if (existsSync(FIXTURE_DIR)) rmSync(FIXTURE_DIR, { recursive: true });
    mkdirSync(fixture(".forge", "progress"), { recursive: true });
    mkdirSync(fixture(".forge", "runs"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(FIXTURE_DIR)) rmSync(FIXTURE_DIR, { recursive: true });
  });

  it("includes restate reminder when completed tasks >= threshold", () => {
    setupForgeEnv({
      statusCurrentTask: "my-feature",
      restateReminder: "on",
      restateThreshold: 3,
      progressContent: [
        "## Phase 1",
        "- [x] T1: do thing",
        "- [x] T2: do another",
        "- [x] T3: do more",
        "- [ ] T4: not done",
      ].join("\n"),
    });

    const result = runHook();
    expect(result.exitCode).toBe(0);

    const snapshot = readFileSync(fixture(".forge", ".compact-snapshot.md"), "utf-8");
    expect(snapshot).toContain("RESTATE REMINDER");
    expect(snapshot).toContain("3 tasks completed");
    expect(snapshot).toContain("threshold: 3");
  });

  it("omits restate reminder when completed tasks < threshold", () => {
    setupForgeEnv({
      statusCurrentTask: "my-feature",
      restateReminder: "on",
      restateThreshold: 5,
      progressContent: [
        "## Phase 1",
        "- [x] T1: do thing",
        "- [x] T2: do another",
        "- [ ] T3: not done",
      ].join("\n"),
    });

    const result = runHook();
    expect(result.exitCode).toBe(0);

    const snapshot = readFileSync(fixture(".forge", ".compact-snapshot.md"), "utf-8");
    expect(snapshot).not.toContain("RESTATE REMINDER");
  });

  it("omits restate reminder when config is off", () => {
    setupForgeEnv({
      statusCurrentTask: "my-feature",
      restateReminder: "off",
      restateThreshold: 1,
      progressContent: [
        "## Phase 1",
        "- [x] T1: do thing",
        "- [x] T2: do another",
        "- [x] T3: do more",
      ].join("\n"),
    });

    const result = runHook();
    expect(result.exitCode).toBe(0);

    const snapshot = readFileSync(fixture(".forge", ".compact-snapshot.md"), "utf-8");
    expect(snapshot).not.toContain("RESTATE REMINDER");
  });

  it("never exits with code 2 regardless of task count", () => {
    setupForgeEnv({
      statusCurrentTask: "my-feature",
      restateReminder: "on",
      restateThreshold: 1,
      progressContent: Array.from({ length: 20 }, (_, i) => `- [x] T${i + 1}`).join("\n"),
    });

    const result = runHook();
    expect(result.exitCode).toBe(0);
  });

  it("snapshot includes package fields when present", () => {
    setupForgeEnv({
      statusCurrentTask: "my-feature",
      restateReminder: "off",
      progressContent: "- [ ] T1",
    });
    writeFileSync(
      fixture(".forge", "status.md"),
      '---\ncurrent_task: "my-feature"\nphase: "build"\ncurrent_package: "P2"\ncompleted_packages: "P1"\nnext_package: "P3"\npackage_count: 3\n---',
    );

    const result = runHook();
    expect(result.exitCode).toBe(0);

    const snapshot = readFileSync(fixture(".forge", ".compact-snapshot.md"), "utf-8");
    expect(snapshot).toContain("current_package=P2");
    expect(snapshot).toContain("completed_packages=P1");
    expect(snapshot).toContain("next_package=P3");
    expect(snapshot).toContain("package_count=3");
  });

  it("snapshot stays under 10000 characters with max caps", () => {
    // Simulate worst-case: 60-line progress + 40-line findings
    mkdirSync(fixture(".forge", "findings"), { recursive: true });

    setupForgeEnv({
      statusCurrentTask: "big-feature",
      restateReminder: "on",
      restateThreshold: 1,
      progressContent: Array.from(
        { length: 60 },
        (_, i) => `- [x] T${i + 1}: a reasonably long task description line`,
      ).join("\n"),
    });

    writeFileSync(
      fixture(".forge", "findings", "big-feature.md"),
      Array.from(
        { length: 40 },
        (_, i) => `### Finding ${i + 1}: A moderately long finding description with details`,
      ).join("\n"),
    );

    const result = runHook();
    expect(result.exitCode).toBe(0);

    const snapshot = readFileSync(fixture(".forge", ".compact-snapshot.md"), "utf-8");
    expect(snapshot.length).toBeLessThan(10_000);
  });
});
