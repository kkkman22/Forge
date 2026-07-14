/**
 * Unit tests for scripts/stop-additional-context.mjs logic.
 *
 * Validates Requirements 2.1–2.8:
 * - missing_verification, incomplete_tasks, auto_advance_gap, subagent_failure
 * - additionalContext length capped at 4096 chars
 * - JSON schema: { hookSpecificOutput: { additionalContext: string } }
 * - Legacy fallback: no match → no output
 */
import { describe, expect, it } from "vitest";

// Import the pure decision function from the script
// The script will export buildStopContext for testability
import {
  buildStopContext,
  MAX_ADDITIONAL_CONTEXT_LENGTH,
} from "../scripts/stop-additional-context.mjs";

describe("buildStopContext", () => {
  it("active phase build + no verification evidence → missing_verification", () => {
    const input = {
      cwd: "/project",
      hook_event_name: "Stop" as const,
    };
    const state = {
      phase: "build",
      task: "T1: Some task",
      hasVerificationEvidence: false,
      incompleteTasks: [],
      isAutoAdvanceGap: false,
      subagentFailure: null,
    };
    const result = buildStopContext(input, state);
    expect(result.shouldEmit).toBe(true);
    expect(result.reason).toBe("missing_verification");
    expect(result.additionalContext!).toContain("build");
    expect(result.additionalContext!).toContain("npm run check");
  });

  it("incomplete progress tasks → incomplete_tasks", () => {
    const input = {
      cwd: "/project",
      hook_event_name: "Stop" as const,
    };
    const state = {
      phase: "build",
      task: "T5: Another task",
      hasVerificationEvidence: true,
      incompleteTasks: ["T5", "T6"],
      isAutoAdvanceGap: false,
      subagentFailure: null,
    };
    const result = buildStopContext(input, state);
    expect(result.shouldEmit).toBe(true);
    expect(result.reason).toBe("incomplete_tasks");
    expect(result.additionalContext).toContain("/forge resume");
  });

  it("auto-advance gap (build done, review should follow) → auto_advance_gap", () => {
    const input = {
      cwd: "/project",
      hook_event_name: "Stop" as const,
    };
    const state = {
      phase: "build",
      task: "T1",
      hasVerificationEvidence: true,
      incompleteTasks: [],
      isAutoAdvanceGap: true,
      subagentFailure: null,
    };
    const result = buildStopContext(input, state);
    expect(result.shouldEmit).toBe(true);
    expect(result.reason).toBe("auto_advance_gap");
    // Should mention no-idle iron law or auto-advance
    expect(
      result.additionalContext!.toLowerCase().includes("no-idle") ||
        result.additionalContext!.includes("铁律") ||
        result.additionalContext!.includes("auto") ||
        result.additionalContext!.includes("review"),
    ).toBe(true);
  });

  it("SubagentStop with failure summary → subagent_failure", () => {
    const input = {
      cwd: "/project",
      hook_event_name: "SubagentStop" as const,
      agent_id: "spec-check-abc",
      agent_type: "spec-check",
    };
    const state = {
      phase: "review",
      task: null,
      hasVerificationEvidence: false,
      incompleteTasks: [],
      isAutoAdvanceGap: false,
      subagentFailure: {
        agentType: "spec-check",
        category: "timeout",
        summary: "Agent timed out during review",
      },
    };
    const result = buildStopContext(input, state);
    expect(result.shouldEmit).toBe(true);
    expect(result.reason).toBe("subagent_failure");
    expect(result.additionalContext).toContain("spec-check");
    expect(result.additionalContext).toContain("timeout");
    expect(result.additionalContext).toContain("fallback");
  });

  it("StopFailure (SubagentStop proxy) with failure summary → subagent_failure", () => {
    const input = {
      cwd: "/project",
      hook_event_name: "StopFailure" as const,
      agent_id: "spec-check-abc",
      agent_type: "spec-check",
    };
    const state = {
      phase: "review",
      task: null,
      hasVerificationEvidence: false,
      incompleteTasks: [],
      isAutoAdvanceGap: false,
      subagentFailure: {
        agentType: "spec-check",
        category: "crash",
        summary: "Agent crashed during review",
      },
    };
    const result = buildStopContext(input, state);
    expect(result.shouldEmit).toBe(true);
    expect(result.reason).toBe("subagent_failure");
    expect(result.additionalContext).toContain("spec-check");
    expect(result.additionalContext).toContain("crash");
    expect(result.reason).toBe("subagent_failure");
    expect(result.additionalContext!).toContain("spec-check");
    expect(result.additionalContext!).toContain("fallback");
  });

  it("no active phase → shouldEmit false, reason none", () => {
    const input = {
      cwd: "/project",
      hook_event_name: "Stop" as const,
    };
    const state = {
      phase: null,
      task: null,
      hasVerificationEvidence: false,
      incompleteTasks: [],
      isAutoAdvanceGap: false,
      subagentFailure: null,
    };
    const result = buildStopContext(input, state);
    expect(result.shouldEmit).toBe(false);
    expect(result.reason).toBe("none");
    expect(result.additionalContext).toBeUndefined();
  });

  it("additionalContext length is capped at 4096 chars", () => {
    const input = {
      cwd: "/project",
      hook_event_name: "Stop" as const,
    };
    const state = {
      phase: "build",
      task: "T1: " + "x".repeat(10000),
      hasVerificationEvidence: false,
      incompleteTasks: Array.from({ length: 100 }, (_, i) => `T${i}: ${"y".repeat(200)}`),
      isAutoAdvanceGap: false,
      subagentFailure: null,
    };
    const result = buildStopContext(input, state);
    if (result.additionalContext) {
      expect(result.additionalContext.length).toBeLessThanOrEqual(4096);
    }
  });

  it("output JSON schema is valid when shouldEmit is true", () => {
    const input = {
      cwd: "/project",
      hook_event_name: "Stop" as const,
    };
    const state = {
      phase: "build",
      task: "T1",
      hasVerificationEvidence: false,
      incompleteTasks: [],
      isAutoAdvanceGap: false,
      subagentFailure: null,
    };
    const result = buildStopContext(input, state);
    expect(result.shouldEmit).toBe(true);
    // The script wraps this in { hookSpecificOutput: { additionalContext: ... } }
    const json = JSON.stringify({
      hookSpecificOutput: { additionalContext: result.additionalContext },
    });
    const parsed = JSON.parse(json);
    expect(parsed.hookSpecificOutput.additionalContext).toBeTypeOf("string");
    expect(parsed.hookSpecificOutput.additionalContext.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Contract tests: hooks.json contains Stop/SubagentStop additionalContext hooks
// ---------------------------------------------------------------------------

describe("hooks.json contract: Stop/SubagentStop additionalContext", () => {
  it("Stop hooks include stop-additional-context.mjs", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const hooksPath = resolve(import.meta.dirname ?? ".", "..", "hooks", "hooks.json");
    const raw = readFileSync(hooksPath, "utf-8");
    const config = JSON.parse(raw);
    expect(config.hooks).toBeDefined();
    expect(config.hooks.Stop).toBeDefined();
    expect(Array.isArray(config.hooks.Stop)).toBe(true);

    const stopHookCommands = config.hooks.Stop.flatMap(
      (group: { hooks?: Array<{ args?: string[]; command?: string }> }) =>
        (group.hooks ?? []).map(
          (h: { args?: string[]; command?: string }) => h.command ?? (h.args ?? []).join(" "),
        ),
    );
    const hasAdditionalContextHook = stopHookCommands.some(
      (cmd: string) => typeof cmd === "string" && cmd.includes("stop-additional-context"),
    );
    expect(hasAdditionalContextHook).toBe(true);
  });

  it("hooks.json has StopFailure event with additionalContext hook (SubagentStop proxy)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const hooksPath = resolve(import.meta.dirname ?? ".", "..", "hooks", "hooks.json");
    const raw = readFileSync(hooksPath, "utf-8");
    const config = JSON.parse(raw);
    expect(config.hooks).toBeDefined();
    expect(config.hooks.StopFailure).toBeDefined();
    expect(Array.isArray(config.hooks.StopFailure)).toBe(true);

    // Claude Code requires {type:"command", command:"..."}; verify the
    // stop-additional-context script is referenced via a command entry (the
    // older args[] form is rejected by /doctor and never fires).
    const stopFailureCommands = config.hooks.StopFailure.flatMap(
      (group: { hooks?: Array<{ command?: string }> }) =>
        (group.hooks ?? []).map((h: { command?: string }) => h.command ?? ""),
    );
    const hasAdditionalContextHook = stopFailureCommands.some(
      (command: string) =>
        typeof command === "string" && command.includes("stop-additional-context"),
    );
    expect(hasAdditionalContextHook).toBe(true);
  });
});

describe("stop-additional-context.mjs — ZCode platform output shape", () => {
  it("ZCode signal → top-level additionalContext preserved (whitelist)", () => {
    const { execFileSync } = require("node:child_process");
    const { resolve } = require("node:path");
    const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
    const { tmpdir } = require("node:os");

    const SCRIPT = resolve(__dirname, "../scripts/stop-additional-context.mjs");
    const tmp = mkdtempSync(require("node:path").join(tmpdir(), "forge-stop-zcode-"));
    try {
      // Minimal status.md that triggers missing_verification (phase set, no evidence)
      mkdirSync(require("node:path").join(tmp, ".forge"), { recursive: true });
      writeFileSync(
        require("node:path").join(tmp, ".forge", "status.md"),
        '---\nphase: "build"\nspec: ".forge/specs/x/"\n---\n',
      );
      const stdin = JSON.stringify({ hook_event_name: "Stop", session_id: "s1" });
      const stdout = execFileSync("node", [SCRIPT], {
        cwd: tmp,
        input: stdin,
        encoding: "utf8",
        timeout: 5000,
        env: { ...process.env, ZCODE_PLUGIN_ROOT: "/x/forge/3.9.0" },
      });
      const json = JSON.parse(stdout);
      expect(Object.keys(json).sort()).toEqual(["additionalContext"]);
      expect(json).not.toHaveProperty("hookSpecificOutput");
      expect(typeof json.additionalContext).toBe("string");
      expect(json.additionalContext.length).toBeGreaterThan(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("no ZCode signal (Claude) → hookSpecificOutput.additionalContext preserved", () => {
    const { execFileSync } = require("node:child_process");
    const { resolve } = require("node:path");
    const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
    const { tmpdir } = require("node:os");

    const SCRIPT = resolve(__dirname, "../scripts/stop-additional-context.mjs");
    const tmp = mkdtempSync(require("node:path").join(tmpdir(), "forge-stop-claude-"));
    try {
      mkdirSync(require("node:path").join(tmp, ".forge"), { recursive: true });
      writeFileSync(
        require("node:path").join(tmp, ".forge", "status.md"),
        '---\nphase: "build"\nspec: ".forge/specs/x/"\n---\n',
      );
      const stdin = JSON.stringify({ hook_event_name: "Stop", session_id: "s1" });
      const stdout = execFileSync("node", [SCRIPT], {
        cwd: tmp,
        input: stdin,
        encoding: "utf8",
        timeout: 5000,
        env: { ...process.env },
      });
      const json = JSON.parse(stdout);
      // Claude path: top-level + hookSpecificOutput both present (unchanged)
      expect(json.hookSpecificOutput).toBeDefined();
      expect(json.hookSpecificOutput.additionalContext).toBeDefined();
      expect(json.additionalContext).toBeDefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
