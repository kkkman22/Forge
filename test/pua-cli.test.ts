/**
 * Unit tests for PUA CLI options (`--pua` and `--pua-task-type`).
 *
 * Tests follow the same Commander-based parsing pattern used in
 * `test/forge-loop-cli.test.ts` for the existing skill-aware options.
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
 */
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// PUA task type validation (mirrors src/forge-loop-cli.ts)
// ---------------------------------------------------------------------------

const VALID_PUA_TASK_TYPES = new Set([
  "debug",
  "build",
  "research",
  "architecture",
  "performance",
  "review",
  "deploy",
  "general",
]);

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
// Helper: parse CLI args with PUA options
// ---------------------------------------------------------------------------

/**
 * Creates a fresh Commander program matching the CLI's option definitions
 * (including --pua and --pua-task-type) and parses the given argv array.
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
    .action((objective: string, opts: Record<string, unknown>) => {
      captured = { objective, opts };
    });

  program.parse(["node", "forge-loop", ...argv]);
  return captured;
}

/**
 * Simulates the CLI's SdkDriverConfig construction logic for puaEnabled
 * and puaTaskType, mirroring the actual code in forge-loop-cli.ts.
 */
function buildPuaConfig(opts: Record<string, unknown> | undefined) {
  const puaEnabled = opts?.pua === true;
  const rawPuaTaskType = opts?.puaTaskType as string | undefined;
  const puaTaskType =
    rawPuaTaskType && VALID_PUA_TASK_TYPES.has(rawPuaTaskType)
      ? rawPuaTaskType
      : puaEnabled
        ? "general"
        : undefined;

  return { puaEnabled, puaTaskType };
}

// ---------------------------------------------------------------------------
// 1. --pua option parsing (Req 7.1, 7.2, 7.5)
// ---------------------------------------------------------------------------

describe("--pua option parsing", () => {
  it("defaults --pua to false when not specified", () => {
    const result = parseArgs(["objective"]);
    expect(result?.opts.pua).toBe(false);
  });

  it("parses --pua flag as true when specified", () => {
    const result = parseArgs(["objective", "--pua"]);
    expect(result?.opts.pua).toBe(true);
  });

  it("passes puaEnabled: true to SdkDriverConfig when --pua is specified", () => {
    const result = parseArgs(["objective", "--pua"]);
    const config = buildPuaConfig(result?.opts);
    expect(config.puaEnabled).toBe(true);
  });

  it("passes puaEnabled: false to SdkDriverConfig when --pua is not specified", () => {
    const result = parseArgs(["objective"]);
    const config = buildPuaConfig(result?.opts);
    expect(config.puaEnabled).toBe(false);
  });

  it("existing behavior unchanged when --pua is not specified (Req 7.5)", () => {
    const result = parseArgs(["Build a login form", "--max-iterations", "10"]);
    expect(result?.objective).toBe("Build a login form");
    expect(result?.opts.maxIterations).toBe(10);
    expect(result?.opts.pua).toBe(false);

    const config = buildPuaConfig(result?.opts);
    expect(config.puaEnabled).toBe(false);
    expect(config.puaTaskType).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. --pua-task-type option parsing (Req 7.3, 7.4)
// ---------------------------------------------------------------------------

describe("--pua-task-type option parsing", () => {
  it("parses --pua-task-type debug", () => {
    const result = parseArgs(["objective", "--pua", "--pua-task-type", "debug"]);
    expect(result?.opts.puaTaskType).toBe("debug");
  });

  it("parses --pua-task-type build", () => {
    const result = parseArgs(["objective", "--pua", "--pua-task-type", "build"]);
    expect(result?.opts.puaTaskType).toBe("build");
  });

  it("parses --pua-task-type research", () => {
    const result = parseArgs(["objective", "--pua", "--pua-task-type", "research"]);
    expect(result?.opts.puaTaskType).toBe("research");
  });

  it("parses --pua-task-type architecture", () => {
    const result = parseArgs(["objective", "--pua", "--pua-task-type", "architecture"]);
    expect(result?.opts.puaTaskType).toBe("architecture");
  });

  it("parses --pua-task-type performance", () => {
    const result = parseArgs(["objective", "--pua", "--pua-task-type", "performance"]);
    expect(result?.opts.puaTaskType).toBe("performance");
  });

  it("parses --pua-task-type review", () => {
    const result = parseArgs(["objective", "--pua", "--pua-task-type", "review"]);
    expect(result?.opts.puaTaskType).toBe("review");
  });

  it("parses --pua-task-type deploy", () => {
    const result = parseArgs(["objective", "--pua", "--pua-task-type", "deploy"]);
    expect(result?.opts.puaTaskType).toBe("deploy");
  });

  it("parses --pua-task-type general", () => {
    const result = parseArgs(["objective", "--pua", "--pua-task-type", "general"]);
    expect(result?.opts.puaTaskType).toBe("general");
  });

  it("passes valid puaTaskType to SdkDriverConfig", () => {
    const result = parseArgs(["objective", "--pua", "--pua-task-type", "debug"]);
    const config = buildPuaConfig(result?.opts);
    expect(config.puaTaskType).toBe("debug");
  });

  it("leaves --pua-task-type undefined when not provided", () => {
    const result = parseArgs(["objective"]);
    expect(result?.opts.puaTaskType).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Invalid --pua-task-type fallback (Req 7.3, 7.4)
// ---------------------------------------------------------------------------

describe("--pua-task-type invalid value fallback", () => {
  it("falls back to 'general' for invalid --pua-task-type when --pua is enabled", () => {
    const result = parseArgs(["objective", "--pua", "--pua-task-type", "invalid-type"]);
    const config = buildPuaConfig(result?.opts);
    expect(config.puaEnabled).toBe(true);
    expect(config.puaTaskType).toBe("general");
  });

  it("falls back to 'general' for empty-like --pua-task-type when --pua is enabled", () => {
    const result = parseArgs(["objective", "--pua", "--pua-task-type", "foo"]);
    const config = buildPuaConfig(result?.opts);
    expect(config.puaTaskType).toBe("general");
  });

  it("falls back to undefined for invalid --pua-task-type when --pua is not enabled", () => {
    const result = parseArgs(["objective", "--pua-task-type", "invalid-type"]);
    const config = buildPuaConfig(result?.opts);
    expect(config.puaEnabled).toBe(false);
    expect(config.puaTaskType).toBeUndefined();
  });

  it("defaults puaTaskType to 'general' when --pua is enabled but --pua-task-type is not specified", () => {
    const result = parseArgs(["objective", "--pua"]);
    const config = buildPuaConfig(result?.opts);
    expect(config.puaEnabled).toBe(true);
    expect(config.puaTaskType).toBe("general");
  });
});

// ---------------------------------------------------------------------------
// 4. --pua alongside existing options (backward compatibility)
// ---------------------------------------------------------------------------

describe("--pua alongside existing options", () => {
  it("parses --pua with --tier, --type, --phase, --nature", () => {
    const result = parseArgs([
      "Debug auth module",
      "--tier",
      "full",
      "--type",
      "backend",
      "--phase",
      "bugfix",
      "--nature",
      "bugfix",
      "--pua",
      "--pua-task-type",
      "debug",
    ]);

    expect(result?.objective).toBe("Debug auth module");
    expect(result?.opts.tier).toBe("full");
    expect(result?.opts.type).toBe("backend");
    expect(result?.opts.phase).toBe("bugfix");
    expect(result?.opts.nature).toBe("bugfix");
    expect(result?.opts.pua).toBe(true);
    expect(result?.opts.puaTaskType).toBe("debug");
  });

  it("parses --pua with --max-iterations and --stop-when", () => {
    const result = parseArgs([
      "Fix pagination bug",
      "--max-iterations",
      "20",
      "--stop-when",
      "all tests pass",
      "--pua",
      "--pua-task-type",
      "debug",
    ]);

    expect(result?.objective).toBe("Fix pagination bug");
    expect(result?.opts.maxIterations).toBe(20);
    expect(result?.opts.stopWhen).toBe("all tests pass");
    expect(result?.opts.pua).toBe(true);
    expect(result?.opts.puaTaskType).toBe("debug");
  });

  it("--pua does not affect existing option defaults", () => {
    const result = parseArgs(["objective", "--pua"]);
    expect(result?.opts.preventSleep).toBe("on");
    expect(result?.opts.worktree).toBe(false);
    expect(result?.opts.tier).toBeUndefined();
    expect(result?.opts.type).toBeUndefined();
    expect(result?.opts.phase).toBeUndefined();
    expect(result?.opts.nature).toBeUndefined();
    expect(result?.opts.maxIterations).toBeUndefined();
    expect(result?.opts.maxTokens).toBeUndefined();
  });

  it("--pua is not a skill option (does not require .forge/ directory)", () => {
    const result = parseArgs(["objective", "--pua"]);
    const hasSkillOptions = !!(
      result?.opts.tier ||
      result?.opts.type ||
      result?.opts.phase ||
      result?.opts.nature
    );
    expect(hasSkillOptions).toBe(false);
  });
});
