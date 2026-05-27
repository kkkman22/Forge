/**
 * AC 14 / Requirement 7 — CLI flag compatibility regression.
 *
 * After the forge-loop driver swap (SDK → claude --print stream-json),
 * the public CLI surface must remain literally compatible:
 *
 *   - 22 reserved flags still parse with their original semantics
 *   - `--unknown-flag` is still rejected with non-zero exit
 *   - `--help` output structure (the snapshot) does not regress
 *   - any newly added flag has a default value (no breaking new flag)
 *
 * The 22-flag list is anchored to Requirement 7.1.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Command } from "commander";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const CLI_SRC = resolve(ROOT, "src/forge-loop-cli.ts");
const HELP_BASELINE = resolve(__dirname, "fixtures/help-baseline.txt");

// AC 7.1: 22 reserved flags. Source: requirements.md §Requirement 7.1.
const RESERVED_FLAGS_22: ReadonlyArray<string> = [
  "--max-iterations",
  "--max-tokens",
  "--stop-when",
  "--worktree",
  "--resume",
  "--max-budget-usd",
  "--tier",
  "--prevent-sleep",
  "--lang",
  "--log-format",
  "--log-level",
  "--log-file",
  "--sandbox",
  "--force-no-hooks",
  "--skills-dir",
  "--agent",
  "--type",
  "--phase",
  "--nature",
  "--pua",
  "--pua-task-type",
  "--no-warmup",
];

// Build a Commander instance mirroring the CLI option block in
// src/forge-loop-cli.ts (lines 234–264). Used for argv parsing tests.
function buildProgram() {
  const program = new Command();
  program
    .name("forge-loop")
    .description("Run an autonomous loop with Claude Code Agent SDK")
    .argument("<objective>", "The objective for the autonomous loop")
    .option("--max-iterations <n>", "Maximum number of iterations", Number.parseInt)
    .option("--max-tokens <n>", "Maximum cumulative token limit", Number.parseInt)
    .option("--stop-when <condition>", "Natural-language stop condition")
    .option("--prevent-sleep <on|off>", "Control sleep prevention", "on")
    .option("--worktree", "Run in a separate Git worktree", false)
    .option("--max-budget-usd <amount>", "Maximum dollar budget", Number.parseFloat)
    .option("--tier <tier>", "Preset routing tier (light|standard|full)")
    .option("--type <type>", "Preset task type")
    .option("--phase <phase>", "Preset project phase")
    .option("--nature <nature>", "Preset work nature (feature|refactor|bugfix)")
    .option("--pua", "Enable PUA Quality Engine", false)
    .option("--pua-task-type <type>", "PUA task type")
    .option("--resume <branchName>", "Resume an existing run on a forge/ branch")
    .option("--lang <locale>", "Set display language (zh|en)")
    .option("--log-format <text|json>", "Log output format (text|json)", "text")
    .option("--log-level <debug|info|warn|error>", "Minimum log level", "info")
    .option("--log-file <path>", "Write JSON logs to file (dual-write mode)")
    .option(
      "--sandbox [profile]",
      "Enable sandbox mode with fine-grained access control. Optionally specify a profile name.",
    )
    .option("--force-no-hooks", "Skip hooks protection validation (use at your own risk)", false)
    .option("--skills-dir <path>", "Load external SKILL plugins from directory")
    .option("--agent <name>", "Agent to use for iterations (claude|mock)", "claude")
    .option("--no-warmup", "Skip warm-up spawn (for sandbox/CI)", false)
    .exitOverride() // throw instead of process.exit so tests can catch
    .action(() => {
      // no-op for parse-only tests
    });
  return program;
}

describe("CLI flag compatibility (AC 7.1) — 22 reserved flags", () => {
  it("registers exactly the 22 reserved flags in the source", () => {
    const src = readFileSync(CLI_SRC, "utf-8");
    for (const flag of RESERVED_FLAGS_22) {
      // Match `.option("<flag>` OR `.option(\n  "<flag>` (multi-line form).
      // We just look for `"<flag>` immediately followed by space/`<`/`[`/`"`.
      const pattern = new RegExp(`"${flag.replace(/-/g, "\\-")}[ <\\["]`);
      expect(pattern.test(src), `flag ${flag} missing from forge-loop-cli.ts`).toBe(true);
    }
  });

  it("source file does not introduce new mandatory flags beyond the 22 reserved", () => {
    const src = readFileSync(CLI_SRC, "utf-8");
    // Locate the forge-loop main option block: starts at `.name("forge-loop")`
    // and ends at the matching `.action(` on the same chained call. We anchor
    // on `.name("forge-loop")` to avoid matching the inner `skill` subcommand
    // (which has its own `.action(`).
    const blockStart = src.indexOf('.name("forge-loop")');
    expect(blockStart, 'could not locate .name("forge-loop") in source').toBeGreaterThan(-1);
    const blockEnd = src.indexOf(".action(", blockStart);
    expect(
      blockEnd,
      'could not locate trailing .action() after .name("forge-loop")',
    ).toBeGreaterThan(blockStart);
    const optionBlock = src.slice(blockStart, blockEnd);
    const optMatches = optionBlock.match(/"--[a-z-]+(?=[ <"[])/g) ?? [];
    const declaredFlags = new Set(optMatches.map((m) => m.replace(/^"/, "")));
    // Every declared flag must be in our reserved list (no breaking new flag).
    for (const f of declaredFlags) {
      expect(
        RESERVED_FLAGS_22.includes(f),
        `unexpected new flag ${f} in forge-loop-cli.ts — AC 7.4 forbids breaking new flags`,
      ).toBe(true);
    }
    // And every reserved flag must be declared (no removed flag).
    for (const f of RESERVED_FLAGS_22) {
      expect(declaredFlags.has(f), `reserved flag ${f} removed from forge-loop-cli.ts`).toBe(true);
    }
  });
});

describe("CLI flag compatibility (AC 7.2) — per-flag parse smoke", () => {
  // One unit-test per reserved flag: confirm the flag parses without throwing
  // and produces a defined option value (or the documented boolean default).
  const cases: Array<{ flag: string; argv: string[]; expect: string; value?: unknown }> = [
    { flag: "--max-iterations", argv: ["--max-iterations", "10"], expect: "maxIterations" },
    { flag: "--max-tokens", argv: ["--max-tokens", "1000"], expect: "maxTokens" },
    { flag: "--stop-when", argv: ["--stop-when", "done"], expect: "stopWhen" },
    { flag: "--worktree", argv: ["--worktree"], expect: "worktree", value: true },
    { flag: "--resume", argv: ["--resume", "forge/x"], expect: "resume" },
    { flag: "--max-budget-usd", argv: ["--max-budget-usd", "5"], expect: "maxBudgetUsd" },
    { flag: "--tier", argv: ["--tier", "light"], expect: "tier" },
    { flag: "--prevent-sleep", argv: ["--prevent-sleep", "off"], expect: "preventSleep" },
    { flag: "--lang", argv: ["--lang", "zh"], expect: "lang" },
    { flag: "--log-format", argv: ["--log-format", "json"], expect: "logFormat" },
    { flag: "--log-level", argv: ["--log-level", "debug"], expect: "logLevel" },
    { flag: "--log-file", argv: ["--log-file", "/tmp/x.jsonl"], expect: "logFile" },
    { flag: "--sandbox", argv: ["--sandbox"], expect: "sandbox" },
    {
      flag: "--force-no-hooks",
      argv: ["--force-no-hooks"],
      expect: "forceNoHooks",
      value: true,
    },
    { flag: "--skills-dir", argv: ["--skills-dir", "/x"], expect: "skillsDir" },
    { flag: "--agent", argv: ["--agent", "mock"], expect: "agent" },
    { flag: "--type", argv: ["--type", "backend"], expect: "type" },
    { flag: "--phase", argv: ["--phase", "iteration"], expect: "phase" },
    { flag: "--nature", argv: ["--nature", "bugfix"], expect: "nature" },
    { flag: "--pua", argv: ["--pua"], expect: "pua", value: true },
    { flag: "--pua-task-type", argv: ["--pua-task-type", "debug"], expect: "puaTaskType" },
    { flag: "--no-warmup", argv: ["--no-warmup"], expect: "warmup", value: false },
  ];

  expect(cases.length).toBe(22);

  for (const c of cases) {
    it(`${c.flag} parses without error and exposes opts.${c.expect}`, () => {
      const program = buildProgram();
      program.parse(["obj", ...c.argv], { from: "user" });
      const opts = program.opts() as Record<string, unknown>;
      if (c.value !== undefined) {
        expect(opts[c.expect]).toBe(c.value);
      } else {
        expect(opts[c.expect]).toBeDefined();
      }
    });
  }
});

describe("CLI flag compatibility (AC 7.3) — unknown flag rejection", () => {
  it("rejects --unknown-flag with non-zero exit and 'unknown option' on stderr", () => {
    const program = buildProgram();
    let captured: { exit?: number; msg?: string } = {};
    try {
      program.parse(["obj", "--unknown-flag"], { from: "user" });
    } catch (e) {
      const err = e as { exitCode?: number; message?: string; code?: string };
      captured = { exit: err.exitCode ?? 1, msg: err.message };
    }
    expect(captured.exit).toBeDefined();
    expect(captured.exit).not.toBe(0);
    expect(captured.msg ?? "").toMatch(/unknown option/i);
  });

  it("rejects --max-iter (typo / shortened reserved flag) with non-zero exit", () => {
    const program = buildProgram();
    let threw = false;
    try {
      program.parse(["obj", "--max-iter", "5"], { from: "user" });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe("CLI flag compatibility (AC 7.4) — every flag has a default or is optional", () => {
  it("commander declarations: required-arg flags use angle brackets, optional flags use square brackets or no arg", () => {
    const src = readFileSync(CLI_SRC, "utf-8");
    // Boolean flags must declare an explicit `false` default.
    // We allow the option declaration to span multiple lines; we also tolerate
    // descriptions that embed `(...)` parens by checking only that the literal
    // `, false)` token appears within the same `.option(...)` call as `<flag>`.
    const booleanFlagsWithExplicitDefault = ["--worktree", "--pua", "--force-no-hooks"];
    for (const flag of booleanFlagsWithExplicitDefault) {
      const idx = src.indexOf(`.option("${flag}"`);
      expect(idx, `${flag} should be declared via .option`).toBeGreaterThan(-1);
      // Find the matching `)` that closes this .option call. Naive: search
      // forward up to the next `.option(` or end of file, then assert
      // `, false)` is in that span.
      const slice = src.slice(idx, idx + 400);
      expect(/,\s*false\s*\)/.test(slice), `${flag} should declare an explicit false default`).toBe(
        true,
      );
    }

    // String flags with explicit default value.
    const stringFlagsWithDefault: Array<[string, string]> = [
      ["--prevent-sleep", '"on"'],
      ["--log-format", '"text"'],
      ["--log-level", '"info"'],
      ["--agent", '"claude"'],
    ];
    for (const [flag, expectedDefault] of stringFlagsWithDefault) {
      const idx = src.indexOf(`.option("${flag} <`);
      expect(idx, `${flag} should be declared via .option`).toBeGreaterThan(-1);
      const slice = src.slice(idx, idx + 400);
      expect(
        slice.includes(`, ${expectedDefault})`),
        `${flag} should have default ${expectedDefault}`,
      ).toBe(true);
    }
  });
});

describe("CLI flag compatibility (AC 7.5) — --help snapshot regression", () => {
  it("--help baseline fixture exists (record it via scripts/record-help-baseline.mjs)", () => {
    expect(
      existsSync(HELP_BASELINE),
      `Missing baseline at ${HELP_BASELINE}. Run: node scripts/record-help-baseline.mjs`,
    ).toBe(true);
  });

  it("baseline contains every reserved flag from the 22-flag list", () => {
    if (!existsSync(HELP_BASELINE)) return; // first test already failed; don't double-fail
    const baseline = readFileSync(HELP_BASELINE, "utf-8");
    // Negation flags (--no-xxx) are hidden from Commander --help output
    const helpVisibleFlags = RESERVED_FLAGS_22.filter((f) => !f.startsWith("--no-"));
    for (const flag of helpVisibleFlags) {
      expect(baseline.includes(flag), `baseline help missing ${flag}`).toBe(true);
    }
  });

  it("current --help (built program) lists every reserved flag", () => {
    // Use the built Commander program directly — getting full --help from the
    // CLI binary requires building the dist bundle, which is slower than
    // necessary for a regression check.
    const program = buildProgram();
    const helpText = program.helpInformation();
    // Negation flags (--no-xxx) are hidden from Commander --help output
    const helpVisibleFlags = RESERVED_FLAGS_22.filter((f) => !f.startsWith("--no-"));
    for (const flag of helpVisibleFlags) {
      expect(helpText.includes(flag), `help info missing ${flag}`).toBe(true);
    }
  });

  it("current --help matches baseline (snapshot equality)", () => {
    if (!existsSync(HELP_BASELINE)) return;
    const baseline = readFileSync(HELP_BASELINE, "utf-8").trim();
    const current = buildProgram().helpInformation().trim();

    // Compare the set of registered option lines (more robust than full text
    // equality — Commander reformats whitespace across versions).
    const extractFlagLines = (s: string) =>
      s
        .split("\n")
        .filter((l) => l.trim().startsWith("--"))
        .map((l) => l.trim().replace(/\s+/g, " "))
        .sort();
    const baselineFlags = extractFlagLines(baseline);
    const currentFlags = extractFlagLines(current);
    expect(currentFlags).toEqual(baselineFlags);
  });
});

describe("CLI flag compatibility — process-level smoke (AC 7.3 binary form)", () => {
  it("forge-loop CLI binary (via tsx) rejects --unknown-flag with non-zero exit", () => {
    // Run the actual CLI to confirm the assembled main() rejects unknown
    // flags with non-zero. Use commander's built-in error path; the CLI exits
    // before any startup() call thanks to the unknown-option error happening
    // during program.parse().
    const tsxBin = resolve(ROOT, "node_modules", ".bin", "tsx");
    if (!existsSync(tsxBin)) {
      // tsx not available in this checkout — skip the binary smoke.
      return;
    }
    const result = spawnSync(tsxBin, [CLI_SRC, "objective", "--definitely-unknown"], {
      cwd: ROOT,
      encoding: "utf-8",
      env: { ...process.env, FORGE_TEST_MODE: "1" },
      timeout: 15_000,
    });
    expect(result.status).not.toBe(0);
    const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    expect(combined).toMatch(/unknown option/i);
  });
});

// Helper for static check that the file itself compiles — guards against
// accidental syntax errors from regex authoring above.
describe("test-file self-validity", () => {
  it("RESERVED_FLAGS_22 length is exactly 22", () => {
    expect(RESERVED_FLAGS_22.length).toBe(22);
  });
  it("forge-loop-cli.ts is readable", () => {
    expect(existsSync(CLI_SRC)).toBe(true);
    expect(readFileSync(CLI_SRC, "utf-8").length).toBeGreaterThan(0);
  });
  it("execFileSync available (node child_process import smoke)", () => {
    const v = execFileSync("node", ["--version"], { encoding: "utf-8" });
    expect(v.trim()).toMatch(/^v\d+\./);
  });
});
