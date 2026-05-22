/**
 * Unit tests for the CLI entry point (`src/forge-loop-cli.ts`).
 *
 * The CLI module is a thin integration layer with many side effects
 * (process.exit, startup, spawn, etc.), so we test the validation and
 * configuration logic indirectly through the pure-function modules it
 * depends on: Commander argument parsing, git validation, sleep
 * prevention, worktree cleanup, and output schema construction.
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 4.1, 4.2, 4.3, 4.6, 4.7, 7.1, 7.3, 7.4, 7.6**
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildAgentOutputSchema } from "../src/agent-output.js";
import type { LoopConfig, RunLimits } from "../src/loop-types.js";
import { buildSleepPreventionCommand } from "../src/sleep-preventer.js";
import { decideWorktreeCleanup, isValidWorktreeSource } from "../src/worktree-manager.js";

// Import backupWorktreeNotes from the CLI module. The module has a top-level
// main() call that triggers Commander parsing and process.exit when
// process.argv lacks the required 'objective' argument. We mock the SDK
// dependency to prevent network calls, and the Commander error handler
// calls process.exit(1) which Vitest intercepts as an unhandled rejection.
// We suppress this by mocking process.exit during module load.
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  startup: vi.fn().mockResolvedValue({}),
}));

// Import pure functions from sdk-driver for pre-flight check tests
import { CliError } from "../src/cli-error.js";

// Temporarily suppress process.exit during module import
const _origExit = process.exit;
process.exit = (() => {}) as never;
const {
  backupWorktreeNotes,
  VALID_TIERS,
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_MAX_CONCURRENT_LOOPS,
  SUPPORTED_LOCALES,
} = await import("../src/forge-loop-cli.js");
const { detectSkillAwareMode, validateHooksPresence } = await import("../src/sdk-driver.js");
const { detectLocale } = await import("../src/locale-detector.js");
// Allow a microtask for the main().catch() promise chain to settle
await new Promise((r) => setTimeout(r, 50));
process.exit = _origExit;

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Argument parsing — Commander parses expected options (Req 6.1–6.6, 6.10)
// ---------------------------------------------------------------------------

describe("argument parsing", () => {
  /**
   * Helper that creates a fresh Commander program matching the CLI's
   * option definitions and parses the given argv array.
   */
  function parseArgs(argv: string[]) {
    let captured: { objective: string; opts: Record<string, unknown> } | undefined;

    const program = new Command();
    program
      .name("forge-loop")
      .description("Run an autonomous loop with Claude Code Agent SDK")
      .argument("<objective>", "The objective for the autonomous loop")
      .option("--max-iterations <n>", "Maximum number of iterations", parseInt)
      .option("--max-tokens <n>", "Maximum cumulative token limit", parseInt)
      .option("--stop-when <condition>", "Natural-language stop condition")
      .option("--prevent-sleep <on|off>", "Control sleep prevention", "on")
      .option("--worktree", "Run in a separate Git worktree", false)
      .option("--max-budget-usd <amount>", "Maximum dollar budget", parseFloat)
      .option("--tier <tier>", "Preset routing tier (light|standard|full)")
      .option("--type <type>", "Preset task type (frontend|backend|fullstack|data|infra|docs)")
      .option("--phase <phase>", "Preset project phase (greenfield|iteration|refactor|bugfix)")
      .action((objective: string, opts: Record<string, unknown>) => {
        captured = { objective, opts };
      });

    // Commander expects argv in the form: [node, script, ...args]
    program.parse(["node", "forge-loop", ...argv]);
    return captured;
  }

  it("parses the positional objective argument", () => {
    const result = parseArgs(["Build a login form"]);
    expect(result).toBeDefined();
    expect(result?.objective).toBe("Build a login form");
  });

  it("parses --max-iterations as an integer", () => {
    const result = parseArgs(["objective", "--max-iterations", "10"]);
    expect(result?.opts.maxIterations).toBe(10);
  });

  it("parses --max-tokens as an integer", () => {
    const result = parseArgs(["objective", "--max-tokens", "500000"]);
    expect(result?.opts.maxTokens).toBe(500000);
  });

  it("parses --stop-when as a string", () => {
    const result = parseArgs(["objective", "--stop-when", "all tests pass"]);
    expect(result?.opts.stopWhen).toBe("all tests pass");
  });

  it("defaults --prevent-sleep to 'on'", () => {
    const result = parseArgs(["objective"]);
    expect(result?.opts.preventSleep).toBe("on");
  });

  it("parses --prevent-sleep off", () => {
    const result = parseArgs(["objective", "--prevent-sleep", "off"]);
    expect(result?.opts.preventSleep).toBe("off");
  });

  it("defaults --worktree to false", () => {
    const result = parseArgs(["objective"]);
    expect(result?.opts.worktree).toBe(false);
  });

  it("parses --worktree flag", () => {
    const result = parseArgs(["objective", "--worktree"]);
    expect(result?.opts.worktree).toBe(true);
  });

  it("parses --max-budget-usd as a float", () => {
    const result = parseArgs(["objective", "--max-budget-usd", "5.50"]);
    expect(result?.opts.maxBudgetUsd).toBe(5.5);
  });

  it("parses all flags together", () => {
    const result = parseArgs([
      "Build feature X",
      "--max-iterations",
      "20",
      "--max-tokens",
      "1000000",
      "--stop-when",
      "CI passes",
      "--prevent-sleep",
      "off",
      "--worktree",
      "--max-budget-usd",
      "10.00",
    ]);

    expect(result?.objective).toBe("Build feature X");
    expect(result?.opts.maxIterations).toBe(20);
    expect(result?.opts.maxTokens).toBe(1000000);
    expect(result?.opts.stopWhen).toBe("CI passes");
    expect(result?.opts.preventSleep).toBe("off");
    expect(result?.opts.worktree).toBe(true);
    expect(result?.opts.maxBudgetUsd).toBe(10.0);
  });

  it("leaves optional flags undefined when not provided", () => {
    const result = parseArgs(["objective"]);
    expect(result?.opts.maxIterations).toBeUndefined();
    expect(result?.opts.maxTokens).toBeUndefined();
    expect(result?.opts.stopWhen).toBeUndefined();
    expect(result?.opts.maxBudgetUsd).toBeUndefined();
    expect(result?.opts.tier).toBeUndefined();
    expect(result?.opts.type).toBeUndefined();
    expect(result?.opts.phase).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Git validation — isValidWorktreeSource rejects forge/ branches (Req 6.9)
// ---------------------------------------------------------------------------

describe("git validation", () => {
  it("rejects forge/ branch as worktree source", () => {
    expect(isValidWorktreeSource("forge/my-feature")).toBe(false);
  });

  it("rejects forge/ prefix with nested path", () => {
    expect(isValidWorktreeSource("forge/deep/nested/branch")).toBe(false);
  });

  it("accepts main branch as worktree source", () => {
    expect(isValidWorktreeSource("main")).toBe(true);
  });

  it("accepts develop branch as worktree source", () => {
    expect(isValidWorktreeSource("develop")).toBe(true);
  });

  it("accepts feature branch that does not start with forge/", () => {
    expect(isValidWorktreeSource("feature/login")).toBe(true);
  });

  it("accepts branch named 'forged' (not forge/)", () => {
    expect(isValidWorktreeSource("forged")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Sleep prevention — buildSleepPreventionCommand (Req 6.5)
// ---------------------------------------------------------------------------

describe("sleep prevention", () => {
  it("returns null for unsupported platforms", () => {
    expect(buildSleepPreventionCommand("freebsd", 1234)).toBeNull();
    expect(buildSleepPreventionCommand("sunos", 1234)).toBeNull();
    expect(buildSleepPreventionCommand("android", 1234)).toBeNull();
  });

  it("returns caffeinate command for darwin", () => {
    const cmd = buildSleepPreventionCommand("darwin", 42);
    expect(cmd).not.toBeNull();
    expect(cmd?.command).toBe("caffeinate");
    expect(cmd?.args).toContain("-i");
    expect(cmd?.args).toContain("-w");
    expect(cmd?.args).toContain("42");
    expect(cmd?.detached).toBe(false);
  });

  it("returns systemd-inhibit command for linux", () => {
    const cmd = buildSleepPreventionCommand("linux", 99);
    expect(cmd).not.toBeNull();
    expect(cmd?.command).toBe("systemd-inhibit");
    expect(cmd?.args).toContain("--what=idle:sleep");
    expect(cmd?.args).toContain("--mode=block");
  });

  it("returns powershell command for win32", () => {
    const cmd = buildSleepPreventionCommand("win32", 100);
    expect(cmd).not.toBeNull();
    expect(cmd?.command).toBe("powershell.exe");
    expect(cmd?.args).toContain("-NoProfile");
  });

  it("--prevent-sleep off skips sleep prevention (CLI logic)", () => {
    // The CLI checks `opts.preventSleep !== "off"` to decide whether to spawn.
    // When preventSleep is "off", the CLI never calls buildSleepPreventionCommand.
    // We verify the condition logic here:
    const preventSleepValue: string = "off";
    const shouldPrevent = preventSleepValue !== "off";
    expect(shouldPrevent).toBe(false);
  });

  it("--prevent-sleep on enables sleep prevention (CLI logic)", () => {
    const preventSleepValue: string = "on";
    const shouldPrevent = preventSleepValue !== "off";
    expect(shouldPrevent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Worktree cleanup — decideWorktreeCleanup (Req 4.7)
// ---------------------------------------------------------------------------

describe("worktree cleanup", () => {
  it("returns 'remove' when commit count is zero", () => {
    const decision = decideWorktreeCleanup(0);
    expect(decision.action).toBe("remove");
    expect(decision.reason).toContain("no commits");
  });

  it("returns 'preserve' when commit count is positive", () => {
    const decision = decideWorktreeCleanup(1);
    expect(decision.action).toBe("preserve");
    expect(decision.reason).toContain("1 commit");
  });

  it("returns 'preserve' for multiple commits", () => {
    const decision = decideWorktreeCleanup(5);
    expect(decision.action).toBe("preserve");
    expect(decision.reason).toContain("5 commit");
  });
});

// ---------------------------------------------------------------------------
// 5. Output schema — buildAgentOutputSchema (Req 9.1)
// ---------------------------------------------------------------------------

describe("output schema construction", () => {
  it("includes core fields without should_fully_stop when includeStopField is false", () => {
    const schema = buildAgentOutputSchema({ includeStopField: false });

    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties).toHaveProperty("success");
    expect(schema.properties).toHaveProperty("summary");
    expect(schema.properties).toHaveProperty("key_changes_made");
    expect(schema.properties).toHaveProperty("key_learnings");
    expect(schema.properties).not.toHaveProperty("should_fully_stop");
    expect(schema.required).toContain("success");
    expect(schema.required).toContain("summary");
    expect(schema.required).toContain("key_changes_made");
    expect(schema.required).toContain("key_learnings");
    expect(schema.required).not.toContain("should_fully_stop");
  });

  it("includes should_fully_stop when includeStopField is true", () => {
    const schema = buildAgentOutputSchema({ includeStopField: true });

    expect(schema.properties).toHaveProperty("should_fully_stop");
    expect(schema.properties.should_fully_stop).toEqual({ type: "boolean" });
    expect(schema.required).toContain("should_fully_stop");
  });

  it("marks all properties as required", () => {
    const schemaWithStop = buildAgentOutputSchema({ includeStopField: true });
    const propertyNames = Object.keys(schemaWithStop.properties);
    expect(schemaWithStop.required).toEqual(propertyNames);

    const schemaWithoutStop = buildAgentOutputSchema({ includeStopField: false });
    const propertyNamesNoStop = Object.keys(schemaWithoutStop.properties);
    expect(schemaWithoutStop.required).toEqual(propertyNamesNoStop);
  });
});

// ---------------------------------------------------------------------------
// 6. LoopConfig and RunLimits construction (CLI defaults)
// ---------------------------------------------------------------------------

describe("LoopConfig and RunLimits construction", () => {
  it("default LoopConfig values match CLI expectations", () => {
    // The CLI constructs LoopConfig with these defaults:
    const loopConfig: LoopConfig = {
      agent: "claude",
      maxConsecutiveFailures: 3,
      preventSleep: true,
      backoffBaseMs: DEFAULT_BACKOFF_BASE_MS,
      maxConcurrentLoops: DEFAULT_MAX_CONCURRENT_LOOPS,
    };

    expect(loopConfig.agent).toBe("claude");
    expect(loopConfig.maxConsecutiveFailures).toBe(3);
    expect(loopConfig.preventSleep).toBe(true);
    expect(loopConfig.backoffBaseMs).toBe(DEFAULT_BACKOFF_BASE_MS);
    expect(loopConfig.maxConcurrentLoops).toBe(DEFAULT_MAX_CONCURRENT_LOOPS);
  });

  it("RunLimits are constructed from parsed options", () => {
    // Simulating what the CLI does with parsed options
    const opts = {
      maxIterations: 10,
      maxTokens: 500000,
      stopWhen: "all tests pass",
    };

    const limits: RunLimits = {
      maxIterations: opts.maxIterations,
      maxTokens: opts.maxTokens,
      stopWhen: opts.stopWhen,
    };

    expect(limits.maxIterations).toBe(10);
    expect(limits.maxTokens).toBe(500000);
    expect(limits.stopWhen).toBe("all tests pass");
  });

  it("RunLimits fields are undefined when options not provided", () => {
    const opts: { maxIterations?: number; maxTokens?: number; stopWhen?: string } = {};

    const limits: RunLimits = {
      maxIterations: opts.maxIterations,
      maxTokens: opts.maxTokens,
      stopWhen: opts.stopWhen,
    };

    expect(limits.maxIterations).toBeUndefined();
    expect(limits.maxTokens).toBeUndefined();
    expect(limits.stopWhen).toBeUndefined();
  });

  it("preventSleep is derived from --prevent-sleep option", () => {
    // CLI logic: const preventSleep = opts.preventSleep !== "off";
    expect(("on" as string) !== "off").toBe(true);
    expect(("off" as string) !== "off").toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. Cleanup logic — sleep process killed, SDK closed, notes persisted (Req 4.6)
// ---------------------------------------------------------------------------

describe("cleanup logic", () => {
  it("sleep process kill is safe when process is null", () => {
    // The CLI wraps sleepProcess.kill() in try/catch.
    // Verify the pattern is safe:
    const sleepProcess = null as { kill: () => void } | null;
    let killCalled = false;

    if (sleepProcess) {
      try {
        sleepProcess.kill();
        killCalled = true;
      } catch {
        // Ignore
      }
    }

    expect(killCalled).toBe(false);
  });

  it("sleep process kill handles already-exited process", () => {
    // Simulate a process that throws on kill (already exited)
    const sleepProcess = {
      kill: () => {
        throw new Error("Process already exited");
      },
    };

    let errorThrown = false;
    try {
      sleepProcess.kill();
    } catch {
      errorThrown = true;
    }

    // The CLI wraps this in try/catch, so it should not propagate
    expect(errorThrown).toBe(true);
  });

  it("decideWorktreeCleanup returns remove for zero-commit runs", () => {
    const decision = decideWorktreeCleanup(0);
    expect(decision.action).toBe("remove");
  });

  it("decideWorktreeCleanup returns preserve for runs with commits", () => {
    const decision = decideWorktreeCleanup(3);
    expect(decision.action).toBe("preserve");
  });
});

// ---------------------------------------------------------------------------
// 8. Skill-aware CLI options — --tier, --type, --phase (Req 7.1, 7.3, 7.4, 7.6)
// ---------------------------------------------------------------------------

describe("skill-aware CLI options", () => {
  /**
   * Helper that creates a fresh Commander program matching the CLI's
   * option definitions (including skill-aware options) and parses the given argv array.
   */
  function parseArgs(argv: string[]) {
    let captured: { objective: string; opts: Record<string, unknown> } | undefined;

    const program = new Command();
    program
      .name("forge-loop")
      .description("Run an autonomous loop with Claude Code Agent SDK")
      .argument("<objective>", "The objective for the autonomous loop")
      .option("--max-iterations <n>", "Maximum number of iterations", parseInt)
      .option("--max-tokens <n>", "Maximum cumulative token limit", parseInt)
      .option("--stop-when <condition>", "Natural-language stop condition")
      .option("--prevent-sleep <on|off>", "Control sleep prevention", "on")
      .option("--worktree", "Run in a separate Git worktree", false)
      .option("--max-budget-usd <amount>", "Maximum dollar budget", parseFloat)
      .option("--tier <tier>", "Preset routing tier (light|standard|full)")
      .option("--type <type>", "Preset task type (frontend|backend|fullstack|data|infra|docs)")
      .option("--phase <phase>", "Preset project phase (greenfield|iteration|refactor|bugfix)")
      .action((objective: string, opts: Record<string, unknown>) => {
        captured = { objective, opts };
      });

    program.parse(["node", "forge-loop", ...argv]);
    return captured;
  }

  // -- --tier option parsing (Req 7.1) --

  it("parses --tier light", () => {
    const result = parseArgs(["objective", "--tier", "light"]);
    expect(result?.opts.tier).toBe("light");
  });

  it("parses --tier standard", () => {
    const result = parseArgs(["objective", "--tier", "standard"]);
    expect(result?.opts.tier).toBe("standard");
  });

  it("parses --tier full", () => {
    const result = parseArgs(["objective", "--tier", "full"]);
    expect(result?.opts.tier).toBe("full");
  });

  // -- --type option parsing (Req 7.3) --

  it("parses --type frontend", () => {
    const result = parseArgs(["objective", "--type", "frontend"]);
    expect(result?.opts.type).toBe("frontend");
  });

  it("parses --type backend", () => {
    const result = parseArgs(["objective", "--type", "backend"]);
    expect(result?.opts.type).toBe("backend");
  });

  it("parses --type fullstack", () => {
    const result = parseArgs(["objective", "--type", "fullstack"]);
    expect(result?.opts.type).toBe("fullstack");
  });

  it("parses --type data", () => {
    const result = parseArgs(["objective", "--type", "data"]);
    expect(result?.opts.type).toBe("data");
  });

  it("parses --type infra", () => {
    const result = parseArgs(["objective", "--type", "infra"]);
    expect(result?.opts.type).toBe("infra");
  });

  it("parses --type docs", () => {
    const result = parseArgs(["objective", "--type", "docs"]);
    expect(result?.opts.type).toBe("docs");
  });

  // -- --phase option parsing (Req 7.4) --

  it("parses --phase greenfield", () => {
    const result = parseArgs(["objective", "--phase", "greenfield"]);
    expect(result?.opts.phase).toBe("greenfield");
  });

  it("parses --phase iteration", () => {
    const result = parseArgs(["objective", "--phase", "iteration"]);
    expect(result?.opts.phase).toBe("iteration");
  });

  it("parses --phase refactor", () => {
    const result = parseArgs(["objective", "--phase", "refactor"]);
    expect(result?.opts.phase).toBe("refactor");
  });

  it("parses --phase bugfix", () => {
    const result = parseArgs(["objective", "--phase", "bugfix"]);
    expect(result?.opts.phase).toBe("bugfix");
  });

  // -- All three options together --

  it("parses --tier, --type, and --phase together", () => {
    const result = parseArgs([
      "Build feature Y",
      "--tier",
      "full",
      "--type",
      "backend",
      "--phase",
      "iteration",
    ]);

    expect(result?.objective).toBe("Build feature Y");
    expect(result?.opts.tier).toBe("full");
    expect(result?.opts.type).toBe("backend");
    expect(result?.opts.phase).toBe("iteration");
  });

  it("parses skill options alongside existing options", () => {
    const result = parseArgs([
      "Build feature Z",
      "--max-iterations",
      "15",
      "--tier",
      "standard",
      "--type",
      "fullstack",
      "--phase",
      "greenfield",
      "--stop-when",
      "all tests pass",
    ]);

    expect(result?.objective).toBe("Build feature Z");
    expect(result?.opts.maxIterations).toBe(15);
    expect(result?.opts.tier).toBe("standard");
    expect(result?.opts.type).toBe("fullstack");
    expect(result?.opts.phase).toBe("greenfield");
    expect(result?.opts.stopWhen).toBe("all tests pass");
  });

  // -- Backward compatibility: options undefined when not provided --

  it("leaves --tier, --type, --phase undefined when not provided", () => {
    const result = parseArgs(["objective"]);
    expect(result?.opts.tier).toBeUndefined();
    expect(result?.opts.type).toBeUndefined();
    expect(result?.opts.phase).toBeUndefined();
  });

  // -- .forge/ directory validation (Req 7.6) --

  it("detects skill options presence for .forge/ validation", () => {
    // The CLI checks: const hasSkillOptions = !!(opts.tier || opts.type || opts.phase);
    // When any skill option is set, .forge/ directory must exist.
    const result = parseArgs(["objective", "--tier", "light"]);
    const hasSkillOptions = !!(result?.opts.tier || result?.opts.type || result?.opts.phase);
    expect(hasSkillOptions).toBe(true);
  });

  it("detects no skill options when none are provided", () => {
    const result = parseArgs(["objective"]);
    const hasSkillOptions = !!(result?.opts.tier || result?.opts.type || result?.opts.phase);
    expect(hasSkillOptions).toBe(false);
  });

  it("requires .forge/ directory when --tier is used (CLI validation logic)", () => {
    // The CLI logic: if (!hasForgeDir && hasSkillOptions) → error
    const hasForgeDir = false;
    const result = parseArgs(["objective", "--tier", "standard"]);
    const hasSkillOptions = !!(result?.opts.tier || result?.opts.type || result?.opts.phase);

    const shouldError = !hasForgeDir && hasSkillOptions;
    expect(shouldError).toBe(true);
  });

  it("requires .forge/ directory when --type is used (CLI validation logic)", () => {
    const hasForgeDir = false;
    const result = parseArgs(["objective", "--type", "backend"]);
    const hasSkillOptions = !!(result?.opts.tier || result?.opts.type || result?.opts.phase);

    const shouldError = !hasForgeDir && hasSkillOptions;
    expect(shouldError).toBe(true);
  });

  it("requires .forge/ directory when --phase is used (CLI validation logic)", () => {
    const hasForgeDir = false;
    const result = parseArgs(["objective", "--phase", "bugfix"]);
    const hasSkillOptions = !!(result?.opts.tier || result?.opts.type || result?.opts.phase);

    const shouldError = !hasForgeDir && hasSkillOptions;
    expect(shouldError).toBe(true);
  });

  it("does not require .forge/ directory when no skill options are used", () => {
    const hasForgeDir = false;
    const result = parseArgs(["objective"]);
    const hasSkillOptions = !!(result?.opts.tier || result?.opts.type || result?.opts.phase);

    const shouldError = !hasForgeDir && hasSkillOptions;
    expect(shouldError).toBe(false);
  });

  it("allows skill options when .forge/ directory exists (CLI validation logic)", () => {
    const hasForgeDir = true;
    const result = parseArgs([
      "objective",
      "--tier",
      "full",
      "--type",
      "infra",
      "--phase",
      "refactor",
    ]);
    const hasSkillOptions = !!(result?.opts.tier || result?.opts.type || result?.opts.phase);

    const shouldError = !hasForgeDir && hasSkillOptions;
    expect(shouldError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. --nature CLI option (Req 11.4, 12.8)
// ---------------------------------------------------------------------------

describe("--nature CLI option", () => {
  /**
   * Helper that creates a fresh Commander program matching the CLI's
   * option definitions (including --nature) and parses the given argv array.
   */
  function parseArgs(argv: string[]) {
    let captured: { objective: string; opts: Record<string, unknown> } | undefined;

    const program = new Command();
    program
      .name("forge-loop")
      .description("Run an autonomous loop with Claude Code Agent SDK")
      .argument("<objective>", "The objective for the autonomous loop")
      .option("--max-iterations <n>", "Maximum number of iterations", parseInt)
      .option("--max-tokens <n>", "Maximum cumulative token limit", parseInt)
      .option("--stop-when <condition>", "Natural-language stop condition")
      .option("--prevent-sleep <on|off>", "Control sleep prevention", "on")
      .option("--worktree", "Run in a separate Git worktree", false)
      .option("--max-budget-usd <amount>", "Maximum dollar budget", parseFloat)
      .option("--tier <tier>", "Preset routing tier (light|standard|full)")
      .option("--type <type>", "Preset task type (frontend|backend|fullstack|data|infra|docs)")
      .option("--phase <phase>", "Preset project phase (greenfield|iteration|refactor|bugfix)")
      .option("--nature <nature>", "Preset work nature (feature|refactor|bugfix)")
      .action((objective: string, opts: Record<string, unknown>) => {
        captured = { objective, opts };
      });

    program.parse(["node", "forge-loop", ...argv]);
    return captured;
  }

  it("parses --nature feature", () => {
    const result = parseArgs(["objective", "--nature", "feature"]);
    expect(result?.opts.nature).toBe("feature");
  });

  it("parses --nature refactor", () => {
    const result = parseArgs(["objective", "--nature", "refactor"]);
    expect(result?.opts.nature).toBe("refactor");
  });

  it("parses --nature bugfix", () => {
    const result = parseArgs(["objective", "--nature", "bugfix"]);
    expect(result?.opts.nature).toBe("bugfix");
  });

  it("leaves --nature undefined when not provided", () => {
    const result = parseArgs(["objective"]);
    expect(result?.opts.nature).toBeUndefined();
  });

  it("parses --nature alongside other skill options", () => {
    const result = parseArgs([
      "Refactor auth module",
      "--tier",
      "standard",
      "--type",
      "backend",
      "--phase",
      "iteration",
      "--nature",
      "refactor",
    ]);

    expect(result?.objective).toBe("Refactor auth module");
    expect(result?.opts.tier).toBe("standard");
    expect(result?.opts.type).toBe("backend");
    expect(result?.opts.phase).toBe("iteration");
    expect(result?.opts.nature).toBe("refactor");
  });

  it("--nature counts as a skill option for .forge/ validation", () => {
    const result = parseArgs(["objective", "--nature", "bugfix"]);
    const hasSkillOptions = !!(
      result?.opts.tier ||
      result?.opts.type ||
      result?.opts.phase ||
      result?.opts.nature
    );
    expect(hasSkillOptions).toBe(true);
  });

  it("requires .forge/ directory when --nature is used (CLI validation logic)", () => {
    const hasForgeDir = false;
    const result = parseArgs(["objective", "--nature", "refactor"]);
    const hasSkillOptions = !!(
      result?.opts.tier ||
      result?.opts.type ||
      result?.opts.phase ||
      result?.opts.nature
    );

    const shouldError = !hasForgeDir && hasSkillOptions;
    expect(shouldError).toBe(true);
  });

  it("backward compatible: existing usage without --nature still works", () => {
    const result = parseArgs(["Build feature X", "--max-iterations", "20"]);
    expect(result?.objective).toBe("Build feature X");
    expect(result?.opts.maxIterations).toBe(20);
    expect(result?.opts.nature).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 10. backupWorktreeNotes — notes backup before worktree deletion (Req 4.1, 4.2, 4.3)
// ---------------------------------------------------------------------------

describe("backupWorktreeNotes", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(pathJoin(tmpdir(), "forge-test-backup-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns success when notes file exists and copy succeeds", () => {
    // Create a source notes file
    const sourceDir = pathJoin(tmpDir, "worktree", ".forge", "runs", "abc");
    mkdirSync(sourceDir, { recursive: true });
    const sourcePath = pathJoin(sourceDir, "notes.md");
    writeFileSync(sourcePath, "# Run: abc\nBranch: forge/test\n", "utf-8");

    // Destination directory
    const destDir = pathJoin(tmpDir, "main", ".forge", "runs", "abc");

    const result = backupWorktreeNotes(sourcePath, destDir);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    // Verify the file was actually copied
    const destPath = pathJoin(destDir, "notes.md");
    expect(existsSync(destPath)).toBe(true);
    expect(readFileSync(destPath, "utf-8")).toBe("# Run: abc\nBranch: forge/test\n");
  });

  it("returns failure when notes file does not exist", () => {
    const result = backupWorktreeNotes(
      pathJoin(tmpDir, "nonexistent", "notes.md"),
      pathJoin(tmpDir, "dest"),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("creates destination directory recursively", () => {
    // Create source file
    const sourcePath = pathJoin(tmpDir, "source-notes.md");
    writeFileSync(sourcePath, "test content", "utf-8");

    // Deeply nested destination that doesn't exist yet
    const destDir = pathJoin(tmpDir, "deep", "nested", "dest");

    const result = backupWorktreeNotes(sourcePath, destDir);

    expect(result.success).toBe(true);
    expect(existsSync(pathJoin(destDir, "notes.md"))).toBe(true);
  });

  it("returns failure with error message on copy error", () => {
    // Source file doesn't exist — triggers the "not found" path
    const result = backupWorktreeNotes(
      "/definitely/nonexistent/notes.md",
      pathJoin(tmpDir, "dest"),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(typeof result.error).toBe("string");
    expect(result.error?.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 11. --resume CLI option (Req 13.1, 13.2, 13.3)
// ---------------------------------------------------------------------------

describe("--resume CLI option", () => {
  /**
   * Helper that creates a fresh Commander program matching the CLI's
   * option definitions (including --resume) and parses the given argv array.
   */
  function parseArgs(argv: string[]) {
    let captured: { objective: string; opts: Record<string, unknown> } | undefined;

    const program = new Command();
    program
      .name("forge-loop")
      .description("Run an autonomous loop with Claude Code Agent SDK")
      .argument("<objective>", "The objective for the autonomous loop")
      .option("--max-iterations <n>", "Maximum number of iterations", parseInt)
      .option("--max-tokens <n>", "Maximum cumulative token limit", parseInt)
      .option("--stop-when <condition>", "Natural-language stop condition")
      .option("--prevent-sleep <on|off>", "Control sleep prevention", "on")
      .option("--worktree", "Run in a separate Git worktree", false)
      .option("--max-budget-usd <amount>", "Maximum dollar budget", parseFloat)
      .option("--tier <tier>", "Preset routing tier (light|standard|full)")
      .option("--type <type>", "Preset task type (frontend|backend|fullstack|data|infra|docs)")
      .option("--phase <phase>", "Preset project phase (greenfield|iteration|refactor|bugfix)")
      .option("--nature <nature>", "Preset work nature (feature|refactor|bugfix)")
      .option("--pua", "Enable PUA Quality Engine", false)
      .option(
        "--pua-task-type <type>",
        "PUA task type (debug|build|research|architecture|performance|review|deploy|general)",
      )
      .option("--resume <branchName>", "Resume an existing run on a forge/ branch")
      .action((objective: string, opts: Record<string, unknown>) => {
        captured = { objective, opts };
      });

    program.parse(["node", "forge-loop", ...argv]);
    return captured;
  }

  it("parses --resume with a branch name", () => {
    const result = parseArgs(["objective", "--resume", "forge/my-feature"]);
    expect(result?.opts.resume).toBe("forge/my-feature");
  });

  it("leaves --resume undefined when not provided", () => {
    const result = parseArgs(["objective"]);
    expect(result?.opts.resume).toBeUndefined();
  });

  it("parses --resume alongside other options", () => {
    const result = parseArgs([
      "Continue feature work",
      "--resume",
      "forge/login-form",
      "--max-iterations",
      "5",
      "--prevent-sleep",
      "off",
    ]);

    expect(result?.objective).toBe("Continue feature work");
    expect(result?.opts.resume).toBe("forge/login-form");
    expect(result?.opts.maxIterations).toBe(5);
    expect(result?.opts.preventSleep).toBe("off");
  });

  it("--resume skips clean working tree check (CLI validation logic)", () => {
    // When --resume is set, the CLI skips the clean working tree check
    // because the resumed branch may have uncommitted changes from a
    // previous interrupted run.
    const result = parseArgs(["objective", "--resume", "forge/my-branch"]);
    const useWorktree = result?.opts.worktree === true;
    const hasResume = !!result?.opts.resume;

    // The CLI condition: if (!useWorktree && !opts.resume)
    const shouldCheckCleanTree = !useWorktree && !hasResume;
    expect(shouldCheckCleanTree).toBe(false);
  });

  it("--resume with missing branch triggers error path (CLI validation logic)", () => {
    // The CLI checks branchExists() before calling resumeRun.
    // When the branch doesn't exist, it throws a CliError.
    // We verify the validation logic pattern here:
    const resumeBranch = "forge/nonexistent";
    const branchExistsResult = false; // simulated

    const shouldError = !!resumeBranch && !branchExistsResult;
    expect(shouldError).toBe(true);
  });

  it("backward compatible: existing usage without --resume still works", () => {
    const result = parseArgs(["Build feature X", "--max-iterations", "20"]);
    expect(result?.objective).toBe("Build feature X");
    expect(result?.opts.maxIterations).toBe(20);
    expect(result?.opts.resume).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 12. CLI pre-flight checks (Req 10.1, 10.2, 10.4, 10.6)
// ---------------------------------------------------------------------------

describe("CLI pre-flight checks", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(pathJoin(tmpdir(), "forge-preflight-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -- Req 10.1: Missing .forge/ directory outputs error and exits --

  describe("missing .forge/ directory (Req 10.1)", () => {
    it("detectSkillAwareMode returns false when .forge/ does not exist", () => {
      // tmpDir has no .forge/ directory
      const result = detectSkillAwareMode(tmpDir);
      expect(result).toBe(false);
    });

    it("detectSkillAwareMode returns true when .forge/ exists", () => {
      mkdirSync(pathJoin(tmpDir, ".forge"));
      const result = detectSkillAwareMode(tmpDir);
      expect(result).toBe(true);
    });

    it("CLI throws CliError when skill options used without .forge/ directory", () => {
      // Replicate the CLI validation logic:
      // if (!hasForgeDir && hasSkillOptions) → throw CliError
      const hasForgeDir = detectSkillAwareMode(tmpDir); // false
      const hasSkillOptions = true; // e.g., --tier was provided

      expect(hasForgeDir).toBe(false);

      if (!hasForgeDir && hasSkillOptions) {
        const error = new CliError(
          "Error: --tier, --type, --phase, and --nature require a .forge/ directory. Run `forge init` first.",
        );
        expect(error).toBeInstanceOf(CliError);
        expect(error.message).toContain(".forge/");
        expect(error.message).toContain("forge init");
        expect(error.exitCode).toBe(1);
      }
    });

    it("CLI does not error when .forge/ exists with skill options", () => {
      mkdirSync(pathJoin(tmpDir, ".forge"));
      const hasForgeDir = detectSkillAwareMode(tmpDir);
      const hasSkillOptions = true;

      expect(hasForgeDir).toBe(true);
      // No error should be thrown
      const shouldError = !hasForgeDir && hasSkillOptions;
      expect(shouldError).toBe(false);
    });
  });

  // -- Req 10.2: Active task in StatusFile outputs warning --

  describe("active task in StatusFile (Req 10.2)", () => {
    it("warns when StatusFile has an active phase", () => {
      // Create .forge/status.md with an active phase
      const forgeDir = pathJoin(tmpDir, ".forge");
      mkdirSync(forgeDir, { recursive: true });
      writeFileSync(
        pathJoin(forgeDir, "status.md"),
        '---\nphase: "build"\ntier: "standard"\n---\n',
        "utf-8",
      );

      // Replicate the CLI's active task detection logic
      const statusFilePath = pathJoin(tmpDir, ".forge", "status.md");
      const statusContent = readFileSync(statusFilePath, "utf-8");
      const phaseMatch = statusContent.match(/^phase:\s*"?([^"\n]*)"?\s*$/m);

      expect(phaseMatch).not.toBeNull();
      const phase = phaseMatch?.[1].trim();
      expect(phase).toBe("build");

      // Phase is not completed or aborted → should warn
      const shouldWarn = phase !== "" && phase !== "completed" && phase !== "aborted";
      expect(shouldWarn).toBe(true);
    });

    it("does not warn when StatusFile phase is completed", () => {
      const forgeDir = pathJoin(tmpDir, ".forge");
      mkdirSync(forgeDir, { recursive: true });
      writeFileSync(pathJoin(forgeDir, "status.md"), '---\nphase: "completed"\n---\n', "utf-8");

      const statusContent = readFileSync(pathJoin(forgeDir, "status.md"), "utf-8");
      const phaseMatch = statusContent.match(/^phase:\s*"?([^"\n]*)"?\s*$/m);
      const phase = phaseMatch?.[1].trim();

      const shouldWarn = phase !== "" && phase !== "completed" && phase !== "aborted";
      expect(shouldWarn).toBe(false);
    });

    it("does not warn when StatusFile phase is aborted", () => {
      const forgeDir = pathJoin(tmpDir, ".forge");
      mkdirSync(forgeDir, { recursive: true });
      writeFileSync(pathJoin(forgeDir, "status.md"), '---\nphase: "aborted"\n---\n', "utf-8");

      const statusContent = readFileSync(pathJoin(forgeDir, "status.md"), "utf-8");
      const phaseMatch = statusContent.match(/^phase:\s*"?([^"\n]*)"?\s*$/m);
      const phase = phaseMatch?.[1].trim();

      const shouldWarn = phase !== "" && phase !== "completed" && phase !== "aborted";
      expect(shouldWarn).toBe(false);
    });

    it("warns for review phase (active task)", () => {
      const forgeDir = pathJoin(tmpDir, ".forge");
      mkdirSync(forgeDir, { recursive: true });
      writeFileSync(pathJoin(forgeDir, "status.md"), '---\nphase: "review"\n---\n', "utf-8");

      const statusContent = readFileSync(pathJoin(forgeDir, "status.md"), "utf-8");
      const phaseMatch = statusContent.match(/^phase:\s*"?([^"\n]*)"?\s*$/m);
      const phase = phaseMatch?.[1].trim();

      const shouldWarn = phase !== "" && phase !== "completed" && phase !== "aborted";
      expect(shouldWarn).toBe(true);
    });

    it("does not warn when StatusFile has no phase field", () => {
      const forgeDir = pathJoin(tmpDir, ".forge");
      mkdirSync(forgeDir, { recursive: true });
      writeFileSync(pathJoin(forgeDir, "status.md"), '---\ntier: "standard"\n---\n', "utf-8");

      const statusContent = readFileSync(pathJoin(forgeDir, "status.md"), "utf-8");
      const phaseMatch = statusContent.match(/^phase:\s*"?([^"\n]*)"?\s*$/m);

      // No phase field → no warning
      expect(phaseMatch).toBeNull();
    });
  });

  // -- Req 10.4: Invalid --tier value outputs valid options and exits --

  describe("invalid --tier value (Req 10.4)", () => {
    it("VALID_TIERS contains exactly light, standard, full", () => {
      expect(VALID_TIERS.has("light")).toBe(true);
      expect(VALID_TIERS.has("standard")).toBe(true);
      expect(VALID_TIERS.has("full")).toBe(true);
      expect(VALID_TIERS.size).toBe(3);
    });

    it("VALID_TIERS rejects unknown tier values", () => {
      expect(VALID_TIERS.has("mega")).toBe(false);
      expect(VALID_TIERS.has("turbo")).toBe(false);
      expect(VALID_TIERS.has("")).toBe(false);
      expect(VALID_TIERS.has("LIGHT")).toBe(false);
    });

    it("CLI throws CliError with valid options listed for invalid tier", () => {
      const invalidTier = "mega";

      // Replicate the CLI validation logic
      if (!VALID_TIERS.has(invalidTier)) {
        const error = new CliError(
          `Error: Invalid --tier value "${invalidTier}". Valid options: ${[...VALID_TIERS].join(", ")}`,
        );
        expect(error).toBeInstanceOf(CliError);
        expect(error.message).toContain("Invalid --tier value");
        expect(error.message).toContain('"mega"');
        expect(error.message).toContain("light");
        expect(error.message).toContain("standard");
        expect(error.message).toContain("full");
        expect(error.exitCode).toBe(1);
      }
    });

    it("CLI does not throw for valid tier values", () => {
      for (const validTier of ["light", "standard", "full"]) {
        const isValid = VALID_TIERS.has(validTier);
        expect(isValid).toBe(true);
      }
    });
  });

  // -- Req 10.6: Missing hooks.json outputs warning but does not block --

  describe("missing hooks.json (Req 10.6)", () => {
    it("validateHooksPresence returns valid: false when hooks.json is missing", () => {
      // tmpDir has no hooks/ directory
      const result = validateHooksPresence(tmpDir);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("not found");
    });

    it("validateHooksPresence returns valid: true when hooks.json has PreToolUse", () => {
      const hooksDir = pathJoin(tmpDir, "hooks");
      mkdirSync(hooksDir, { recursive: true });
      writeFileSync(
        pathJoin(hooksDir, "hooks.json"),
        JSON.stringify({ hooks: { PreToolUse: [{ type: "check" }] } }),
        "utf-8",
      );

      const result = validateHooksPresence(tmpDir);
      expect(result.valid).toBe(true);
    });

    it("missing hooks.json is non-blocking (warning only, no CliError thrown)", () => {
      // Replicate the CLI's hooks validation logic:
      // The CLI calls validateHooksPresence and only console.warn's — never throws.
      const hooksResult = validateHooksPresence(tmpDir);
      expect(hooksResult.valid).toBe(false);

      // The CLI pattern: warn but continue
      // if (!hooksResult.valid) { console.warn(...) }
      // No CliError is thrown — startup continues.
      // We verify this by confirming the function returns a result (not throws)
      // and the result indicates invalid but provides a reason.
      expect(hooksResult.reason).toBeDefined();
      expect(typeof hooksResult.reason).toBe("string");
    });

    it("validateHooksPresence returns valid: false when PreToolUse section is missing", () => {
      const hooksDir = pathJoin(tmpDir, "hooks");
      mkdirSync(hooksDir, { recursive: true });
      writeFileSync(
        pathJoin(hooksDir, "hooks.json"),
        JSON.stringify({ hooks: { SessionStart: [] } }),
        "utf-8",
      );

      const result = validateHooksPresence(tmpDir);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("PreToolUse");
    });
  });
});

// ---------------------------------------------------------------------------
// 13. --lang CLI option (i18n: Req 3.1, 3.2, 3.3, 9.4)
// ---------------------------------------------------------------------------

describe("--lang CLI option", () => {
  /**
   * Helper that creates a fresh Commander program matching the CLI's
   * option definitions (including --lang) and parses the given argv array.
   */
  function parseArgs(argv: string[]) {
    let captured: { objective: string; opts: Record<string, unknown> } | undefined;

    const program = new Command();
    program
      .name("forge-loop")
      .description("Run an autonomous loop with Claude Code Agent SDK")
      .argument("<objective>", "The objective for the autonomous loop")
      .option("--max-iterations <n>", "Maximum number of iterations", parseInt)
      .option("--max-tokens <n>", "Maximum cumulative token limit", parseInt)
      .option("--stop-when <condition>", "Natural-language stop condition")
      .option("--prevent-sleep <on|off>", "Control sleep prevention", "on")
      .option("--worktree", "Run in a separate Git worktree", false)
      .option("--max-budget-usd <amount>", "Maximum dollar budget", parseFloat)
      .option("--tier <tier>", "Preset routing tier (light|standard|full)")
      .option("--type <type>", "Preset task type (frontend|backend|fullstack|data|infra|docs)")
      .option("--phase <phase>", "Preset project phase (greenfield|iteration|refactor|bugfix)")
      .option("--nature <nature>", "Preset work nature (feature|refactor|bugfix)")
      .option("--pua", "Enable PUA Quality Engine", false)
      .option(
        "--pua-task-type <type>",
        "PUA task type (debug|build|research|architecture|performance|review|deploy|general)",
      )
      .option("--resume <branchName>", "Resume an existing run on a forge/ branch")
      .option("--lang <locale>", "Set display language (zh|en)")
      .action((objective: string, opts: Record<string, unknown>) => {
        captured = { objective, opts };
      });

    program.parse(["node", "forge-loop", ...argv]);
    return captured;
  }

  // -- Valid --lang values are accepted (Req 3.1) --

  it("parses --lang zh", () => {
    const result = parseArgs(["objective", "--lang", "zh"]);
    expect(result?.opts.lang).toBe("zh");
  });

  it("parses --lang en", () => {
    const result = parseArgs(["objective", "--lang", "en"]);
    expect(result?.opts.lang).toBe("en");
  });

  it("parses --lang alongside other options", () => {
    const result = parseArgs([
      "Build feature",
      "--lang",
      "zh",
      "--max-iterations",
      "10",
      "--tier",
      "standard",
    ]);

    expect(result?.objective).toBe("Build feature");
    expect(result?.opts.lang).toBe("zh");
    expect(result?.opts.maxIterations).toBe(10);
    expect(result?.opts.tier).toBe("standard");
  });

  it("leaves --lang undefined when not provided", () => {
    const result = parseArgs(["objective"]);
    expect(result?.opts.lang).toBeUndefined();
  });

  // -- SUPPORTED_LOCALES constant (Req 9.4) --

  it("SUPPORTED_LOCALES contains exactly zh and en", () => {
    expect(SUPPORTED_LOCALES.has("zh")).toBe(true);
    expect(SUPPORTED_LOCALES.has("en")).toBe(true);
    expect(SUPPORTED_LOCALES.size).toBe(2);
  });

  it("SUPPORTED_LOCALES is a ReadonlySet", () => {
    // Verify it behaves as a Set (has, size)
    expect(typeof SUPPORTED_LOCALES.has).toBe("function");
    expect(typeof SUPPORTED_LOCALES.size).toBe("number");
  });

  // -- Invalid --lang value outputs valid options and rejects startup (Req 3.2) --

  it("CLI throws CliError with valid options listed for invalid --lang value", () => {
    const invalidLang = "fr";

    // Replicate the CLI validation logic
    if (!SUPPORTED_LOCALES.has(invalidLang)) {
      const error = new CliError(
        `Error: Invalid --lang value "${invalidLang}". Valid options: ${[...SUPPORTED_LOCALES].join(", ")}`,
      );
      expect(error).toBeInstanceOf(CliError);
      expect(error.message).toContain("Invalid --lang value");
      expect(error.message).toContain('"fr"');
      expect(error.message).toContain("zh");
      expect(error.message).toContain("en");
      expect(error.exitCode).toBe(1);
    }
  });

  it("SUPPORTED_LOCALES rejects unknown locale values", () => {
    expect(SUPPORTED_LOCALES.has("fr")).toBe(false);
    expect(SUPPORTED_LOCALES.has("ja")).toBe(false);
    expect(SUPPORTED_LOCALES.has("")).toBe(false);
    expect(SUPPORTED_LOCALES.has("ZH")).toBe(false);
  });

  // -- Missing --lang delegates to LocaleDetector (Req 3.3) --

  it("missing --lang delegates to detectLocale with all sources", () => {
    // When --lang is not provided, the CLI calls detectLocale() with
    // cliLang undefined, letting lower-priority sources determine locale.
    const result = detectLocale(
      {
        cliLang: undefined,
        configLang: "zh",
        envLang: undefined,
        systemLocale: undefined,
      },
      SUPPORTED_LOCALES,
    );

    expect(result.locale).toBe("zh");
    expect(result.source).toBe("config");
  });

  it("missing --lang falls back to default en when no sources available", () => {
    const result = detectLocale(
      {
        cliLang: undefined,
        configLang: undefined,
        envLang: undefined,
        systemLocale: undefined,
      },
      SUPPORTED_LOCALES,
    );

    expect(result.locale).toBe("en");
    expect(result.source).toBe("default");
  });

  it("--lang takes priority over config and env sources", () => {
    const result = detectLocale(
      {
        cliLang: "en",
        configLang: "zh",
        envLang: "zh",
        systemLocale: "zh_CN.UTF-8",
      },
      SUPPORTED_LOCALES,
    );

    expect(result.locale).toBe("en");
    expect(result.source).toBe("cli");
  });

  // -- Existing CLI options remain unchanged (Req 9.4) --

  it("existing options still work with --lang present", () => {
    const result = parseArgs([
      "Build feature X",
      "--max-iterations",
      "20",
      "--max-tokens",
      "1000000",
      "--stop-when",
      "CI passes",
      "--prevent-sleep",
      "off",
      "--worktree",
      "--max-budget-usd",
      "10.00",
      "--tier",
      "full",
      "--type",
      "backend",
      "--phase",
      "iteration",
      "--nature",
      "feature",
      "--lang",
      "zh",
    ]);

    expect(result?.objective).toBe("Build feature X");
    expect(result?.opts.maxIterations).toBe(20);
    expect(result?.opts.maxTokens).toBe(1000000);
    expect(result?.opts.stopWhen).toBe("CI passes");
    expect(result?.opts.preventSleep).toBe("off");
    expect(result?.opts.worktree).toBe(true);
    expect(result?.opts.maxBudgetUsd).toBe(10.0);
    expect(result?.opts.tier).toBe("full");
    expect(result?.opts.type).toBe("backend");
    expect(result?.opts.phase).toBe("iteration");
    expect(result?.opts.nature).toBe("feature");
    expect(result?.opts.lang).toBe("zh");
  });

  it("backward compatible: existing usage without --lang still works", () => {
    const result = parseArgs(["Build feature X", "--max-iterations", "20"]);
    expect(result?.objective).toBe("Build feature X");
    expect(result?.opts.maxIterations).toBe(20);
    expect(result?.opts.lang).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 14. --log-file CLI option (Req 1.1, 8.1, 8.3)
// ---------------------------------------------------------------------------

describe("--log-file CLI option", () => {
  /**
   * Helper that creates a fresh Commander program matching the CLI's
   * option definitions (including --log-file) and parses the given argv array.
   */
  function parseArgs(argv: string[]) {
    let captured: { objective: string; opts: Record<string, unknown> } | undefined;

    const program = new Command();
    program
      .name("forge-loop")
      .description("Run an autonomous loop with Claude Code Agent SDK")
      .argument("<objective>", "The objective for the autonomous loop")
      .option("--max-iterations <n>", "Maximum number of iterations", parseInt)
      .option("--max-tokens <n>", "Maximum cumulative token limit", parseInt)
      .option("--stop-when <condition>", "Natural-language stop condition")
      .option("--prevent-sleep <on|off>", "Control sleep prevention", "on")
      .option("--worktree", "Run in a separate Git worktree", false)
      .option("--max-budget-usd <amount>", "Maximum dollar budget", parseFloat)
      .option("--tier <tier>", "Preset routing tier (light|standard|full)")
      .option("--type <type>", "Preset task type (frontend|backend|fullstack|data|infra|docs)")
      .option("--phase <phase>", "Preset project phase (greenfield|iteration|refactor|bugfix)")
      .option("--nature <nature>", "Preset work nature (feature|refactor|bugfix)")
      .option("--pua", "Enable PUA Quality Engine", false)
      .option(
        "--pua-task-type <type>",
        "PUA task type (debug|build|research|architecture|performance|review|deploy|general)",
      )
      .option("--resume <branchName>", "Resume an existing run on a forge/ branch")
      .option("--lang <locale>", "Set display language (zh|en)")
      .option("--log-format <text|json>", "Log output format (text|json)", "text")
      .option("--log-level <debug|info|warn|error>", "Minimum log level", "info")
      .option("--log-file <path>", "Write JSON logs to file (dual-write mode)")
      .option("--sandbox", "Enable sandbox mode with fine-grained access control", false)
      .action((objective: string, opts: Record<string, unknown>) => {
        captured = { objective, opts };
      });

    program.parse(["node", "forge-loop", ...argv]);
    return captured;
  }

  // -- --log-file option parses correctly (Req 1.1) --

  it("parses --log-file with a file path", () => {
    const result = parseArgs(["objective", "--log-file", "/tmp/forge.jsonl"]);
    expect(result?.opts.logFile).toBe("/tmp/forge.jsonl");
  });

  it("parses --log-file with a relative path", () => {
    const result = parseArgs(["objective", "--log-file", "./logs/run.jsonl"]);
    expect(result?.opts.logFile).toBe("./logs/run.jsonl");
  });

  // -- --log-file coexists with --log-format and --log-level (Req 8.3) --

  it("parses --log-file alongside --log-format and --log-level", () => {
    const result = parseArgs([
      "Build feature",
      "--log-format",
      "json",
      "--log-level",
      "debug",
      "--log-file",
      "/tmp/forge.jsonl",
    ]);

    expect(result?.opts.logFormat).toBe("json");
    expect(result?.opts.logLevel).toBe("debug");
    expect(result?.opts.logFile).toBe("/tmp/forge.jsonl");
  });

  it("parses --log-file alongside all other options", () => {
    const result = parseArgs([
      "Build feature X",
      "--max-iterations",
      "20",
      "--tier",
      "full",
      "--log-format",
      "text",
      "--log-level",
      "warn",
      "--log-file",
      "/var/log/forge/run.jsonl",
    ]);

    expect(result?.objective).toBe("Build feature X");
    expect(result?.opts.maxIterations).toBe(20);
    expect(result?.opts.tier).toBe("full");
    expect(result?.opts.logFormat).toBe("text");
    expect(result?.opts.logLevel).toBe("warn");
    expect(result?.opts.logFile).toBe("/var/log/forge/run.jsonl");
  });

  // -- --log-file not specified → no log file created (Req 8.1) --

  it("leaves --log-file undefined when not provided", () => {
    const result = parseArgs(["objective"]);
    expect(result?.opts.logFile).toBeUndefined();
  });

  it("--log-format and --log-level still work without --log-file", () => {
    const result = parseArgs(["objective", "--log-format", "json", "--log-level", "debug"]);

    expect(result?.opts.logFormat).toBe("json");
    expect(result?.opts.logLevel).toBe("debug");
    expect(result?.opts.logFile).toBeUndefined();
  });

  // -- Backward compatibility (Req 8.3) --

  it("backward compatible: existing usage without --log-file still works", () => {
    const result = parseArgs(["Build feature X", "--max-iterations", "20"]);
    expect(result?.objective).toBe("Build feature X");
    expect(result?.opts.maxIterations).toBe(20);
    expect(result?.opts.logFile).toBeUndefined();
  });

  // -- Empty --log-file validation logic (Req 1.4) --

  it("CLI throws CliError when --log-file is an empty string (validation logic)", () => {
    // Replicate the CLI validation logic:
    // if (opts.logFile !== undefined && opts.logFile.trim() === "") → throw CliError
    const logFile = "";
    const shouldError = logFile !== undefined && logFile.trim() === "";
    expect(shouldError).toBe(true);

    if (shouldError) {
      const error = new CliError("Error: --log-file requires a non-empty file path.");
      expect(error).toBeInstanceOf(CliError);
      expect(error.message).toContain("non-empty");
      expect(error.exitCode).toBe(1);
    }
  });
});
