#!/usr/bin/env node
/**
 * record-help-baseline.mjs — record the current `forge-loop --help`
 * output to `test/cli-flag-compat/fixtures/help-baseline.txt`.
 *
 * Re-run this AFTER an intentional, reviewed CLI change. The baseline
 * is asserted by `test/cli-flag-compat/cli-flag-compat.test.ts` (AC 7.5).
 *
 * Usage:
 *   node scripts/record-help-baseline.mjs            # write baseline
 *   node scripts/record-help-baseline.mjs --check    # exit non-zero if drift
 *   node scripts/record-help-baseline.mjs --help     # this message
 *
 * The output is generated from a Commander program that mirrors
 * `src/forge-loop-cli.ts` lines 234–264. We don't shell out to the actual
 * CLI binary — that would require a built dist and a working git repo
 * environment, which is not available in clean CI smoke runs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Command } from "commander";

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    "record-help-baseline.mjs — record forge-loop --help baseline\n\n" +
      "Usage:\n" +
      "  node scripts/record-help-baseline.mjs           # write baseline\n" +
      "  node scripts/record-help-baseline.mjs --check   # exit non-zero on drift\n" +
      "  node scripts/record-help-baseline.mjs --help    # this message",
  );
  process.exit(0);
}

const ROOT = resolve(import.meta.dirname, "..");
const BASELINE = resolve(ROOT, "test/cli-flag-compat/fixtures/help-baseline.txt");

function buildProgram() {
  const p = new Command();
  p.name("forge-loop")
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
    .option("--no-warmup", "Skip warm-up spawn (for sandbox/CI)", false);
  return p;
}

const helpText = buildProgram().helpInformation();

if (args.includes("--check")) {
  if (!existsSync(BASELINE)) {
    console.error(`Baseline missing: ${BASELINE}. Re-record with: node scripts/record-help-baseline.mjs`);
    process.exit(1);
  }
  const baseline = readFileSync(BASELINE, "utf-8");
  if (baseline.trim() !== helpText.trim()) {
    console.error("forge-loop --help drifted from baseline.");
    console.error("Run: node scripts/record-help-baseline.mjs (then review the diff).");
    process.exit(1);
  }
  console.log("help baseline OK");
  process.exit(0);
}

mkdirSync(dirname(BASELINE), { recursive: true });
writeFileSync(BASELINE, helpText, "utf-8");
console.log(`Wrote baseline to ${BASELINE}`);
