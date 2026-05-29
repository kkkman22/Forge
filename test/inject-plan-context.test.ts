/**
 * Unit tests for inject-plan-context.mjs — plan context injection script.
 *
 * Tests the script by executing it as a subprocess with a temp plans directory,
 * verifying active plan detection, token budget truncation, and fail-open behavior.
 *
 * **Validates: Requirement 8 (Plan injection)**
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT_PATH = join(process.cwd(), "scripts", "inject-plan-context.mjs");

function createTempPlansDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "forge-plan-test-"));
  mkdirSync(join(dir, ".forge", "plans"), { recursive: true });
  return dir;
}

function writePlan(plansDir: string, name: string, frontmatter: string, body: string): void {
  writeFileSync(join(plansDir, ".forge", "plans", name), `---\n${frontmatter}\n---\n\n${body}`);
}

function runScript(cwd: string, stdinPayload?: string, extraArgs: string[] = []): string {
  try {
    const mainAgentStdin = JSON.stringify({
      session_id: "test-session",
      hook_event_name: "UserPromptSubmit",
    });
    return execFileSync("node", [SCRIPT_PATH, ...extraArgs], {
      cwd,
      encoding: "utf-8",
      timeout: 5000,
      input: stdinPayload ?? mainAgentStdin,
    });
  } catch {
    return "";
  }
}

describe("inject-plan-context.mjs", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Best effort
      }
    }
  });

  it("outputs nothing when plans directory is empty", () => {
    tempDir = createTempPlansDir();
    const output = runScript(tempDir);
    expect(output).toBe("");
  });

  it("outputs active plans", () => {
    tempDir = createTempPlansDir();
    writePlan(
      tempDir,
      "feature-x.md",
      'status: "approved"\ntopic: feature-x',
      "## Objective\nBuild feature X",
    );

    const output = runScript(tempDir);
    expect(output).toContain("=== Forge Context ===");
    expect(output).toContain("feature-x.md");
    expect(output).toContain("Build feature X");
  });

  it("outputs at most 3 active plans (sorted by mtime)", () => {
    tempDir = createTempPlansDir();

    // Create 5 plans with different content
    for (let i = 1; i <= 5; i++) {
      writePlan(tempDir, `plan-${i}.md`, "status: approved", `Plan ${i} content`);
    }

    const output = runScript(tempDir);
    // Should contain at most 3 plan headers
    const planHeaders = output.match(/--- .+plan-\d+\.md ---/g);
    expect(planHeaders).not.toBeNull();
    expect(planHeaders?.length).toBeLessThanOrEqual(3);
  });

  it("skips plans without active/approved status", () => {
    tempDir = createTempPlansDir();
    writePlan(tempDir, "completed.md", "status: completed", "This plan is done");
    writePlan(tempDir, "no-frontmatter.md", "", "No status field");

    const output = runScript(tempDir);
    expect(output).toBe("");
  });

  it("truncates long plans", () => {
    tempDir = createTempPlansDir();
    const longBody = "x".repeat(3000);
    writePlan(tempDir, "long-plan.md", "status: approved", longBody);

    const output = runScript(tempDir);
    expect(output).toContain("[... truncated]");
  });

  it("truncates when total exceeds budget", () => {
    tempDir = createTempPlansDir();

    // Create 3 plans with very large bodies
    for (let i = 1; i <= 3; i++) {
      writePlan(tempDir, `big-${i}.md`, "status: approved", "y".repeat(4000));
    }

    const output = runScript(tempDir);
    // Should contain truncation notice
    expect(output.length).toBeLessThanOrEqual(9000); // budget + header overhead
  });

  it("fails open when plans directory does not exist", () => {
    tempDir = mkdtempSync(join(tmpdir(), "forge-plan-test-"));
    // No .forge/plans directory
    const output = runScript(tempDir);
    expect(output).toBe("");
  });

  it("correctly formats output with plan paths and content", () => {
    tempDir = createTempPlansDir();
    writePlan(
      tempDir,
      "test-plan.md",
      "status: approved\ntopic: test",
      "## Tasks\n- [ ] Task 1\n- [x] Task 2",
    );

    const output = runScript(tempDir);
    expect(output).toContain(".forge/plans/test-plan.md");
    expect(output).toContain("Task 1");
    expect(output).toContain("Task 2");
  });

  it("subagent stdin (with agent_id) yields zero-byte stdout", () => {
    tempDir = createTempPlansDir();
    writePlan(
      tempDir,
      "active-plan.md",
      "status: approved",
      "This plan should NOT appear in subagent output",
    );

    const subagentStdin = JSON.stringify({
      session_id: "s1",
      hook_event_name: "UserPromptSubmit",
      agent_id: "spec-check",
    });

    const output = runScript(tempDir, subagentStdin);
    expect(output.length).toBe(0);
  });

  it("main-agent stdin (no agent_id) produces full plan output", () => {
    tempDir = createTempPlansDir();
    writePlan(
      tempDir,
      "plan-a.md",
      'status: "approved"\ntopic: test-main-agent',
      "## Objective\nMain agent output",
    );

    const mainAgentStdin = JSON.stringify({
      session_id: "s-main",
      hook_event_name: "UserPromptSubmit",
    });
    const output = runScript(tempDir, mainAgentStdin);

    expect(output).toContain("=== Forge Context ===");
    expect(output).toContain("plan-a.md");
    expect(output).toContain("Main agent output");
  });

  it("--phase build filters to incomplete tasks only", () => {
    tempDir = createTempPlansDir();
    writePlan(
      tempDir,
      "build-plan.md",
      "status: approved",
      "## Wave 1\n- [x] Task 0 (done)\n- [ ] Task 1 (todo)\n- [ ] Task 2 (todo)\nSome description text\n## Wave 2\n- [x] Task 3 (done)",
    );

    const output = runScript(tempDir, undefined, ["--phase", "build"]);
    expect(output).toContain("Task 1 (todo)");
    expect(output).toContain("Task 2 (todo)");
    expect(output).toContain("Wave 1");
    expect(output).toContain("Wave 2");
    expect(output).not.toContain("Task 0 (done)");
    expect(output).not.toContain("Task 3 (done)");
    expect(output).not.toContain("Some description text");
  });

  it("--phase review shows only headers and task checkboxes", () => {
    tempDir = createTempPlansDir();
    writePlan(
      tempDir,
      "review-plan.md",
      "status: approved",
      "## Wave 1\n- [ ] Task 1\nDetailed description here\n- [x] Task 2\nMore details",
    );

    const output = runScript(tempDir, undefined, ["--phase", "review"]);
    expect(output).toContain("Wave 1");
    expect(output).toContain("Task 1");
    expect(output).toContain("Task 2");
    expect(output).not.toContain("Detailed description");
    expect(output).not.toContain("More details");
  });

  it("--phase test shows only task titles", () => {
    tempDir = createTempPlansDir();
    writePlan(
      tempDir,
      "test-plan.md",
      "status: approved",
      "## Wave 1\n- [ ] Task 1\n- [x] Task 2\n## Wave 2\n- [ ] Task 3",
    );

    const output = runScript(tempDir, undefined, ["--phase", "test"]);
    expect(output).toContain("Task 1");
    expect(output).toContain("Task 2");
    expect(output).toContain("Task 3");
    expect(output).not.toContain("Wave 1");
    expect(output).not.toContain("Wave 2");
  });

  it("--compact strips descriptions from task lines", () => {
    tempDir = createTempPlansDir();
    writePlan(
      tempDir,
      "compact-plan.md",
      "status: approved",
      "- [ ] Task 1 _with emphasis description_\n- [ ] Task 2 _another desc_",
    );

    const output = runScript(tempDir, undefined, ["--phase", "build", "--compact"]);
    expect(output).toContain("Task 1");
    expect(output).toContain("Task 2");
    expect(output).not.toContain("_with emphasis");
    expect(output).not.toContain("_another desc");
  });
});
