#!/usr/bin/env node
/**
 * Quota checker — counts doc pairs and checks against config max_count.
 * Exit codes: 0 = clean, 1 = quota exceeded, 3 = internal error.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeExitResult } from "../src/docs-governance/cli/_runtime.js";
import { formatDiagnostics, formatNdjson } from "../src/docs-governance/reporter/diagnostic.js";
import { formatHelp } from "../src/docs-governance/cli/_help.js";
import { countDocPairs, checkQuota } from "../src/docs-governance/quota.js";
import { loadConfigWithDefaults } from "../src/docs-governance/config.js";
import { walkMdFiles } from "../src/docs-governance/cli/scan-files.js";
import type { DiagnosticRecord, DocPath } from "../src/docs-governance/types.js";

const SCRIPT_NAME = "check-docs-quota";

// ── Main ──

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    formatHelp(SCRIPT_NAME, "Check doc pair count against configured max_count.", [
      "--json                Output diagnostics as NDJSON",
      "--allow-grow=<adr>    Allow exceeding quota with ADR path",
      "--help                Show this help message",
    ]),
  );
  process.exit(0);
}

const jsonMode = args.includes("--json");
const allowGrowArg = args.find((a) => a.startsWith("--allow-grow="));
const allowGrow = allowGrowArg ? allowGrowArg.split("=").slice(1).join("=") : undefined;
const rootDir = resolve(process.cwd());

const result = computeExitResult((): DiagnosticRecord[] => {
  // Load config
  const configPath = resolve(rootDir, ".tinkerman/config.md");
  let config;
  try {
    const raw = readFileSync(configPath, "utf-8");
    config = loadConfigWithDefaults(raw);
  } catch {
    // Config not found — use defaults (loadConfigWithDefaults handles empty)
    config = loadConfigWithDefaults("");
  }

  // Collect doc files
  const docsDir = resolve(rootDir, "docs");
  const mdFiles = walkMdFiles(docsDir, { relativeTo: rootDir });

  // Check quota
  return checkQuota(mdFiles, config, { allowGrow });
});

if (jsonMode) {
  process.stdout.write(`${formatNdjson(result.diagnostics)}\n`);
} else {
  const output = formatDiagnostics(result.diagnostics);
  process.stdout.write(`${output}\n`);
}

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
}

process.exit(result.exitCode);
