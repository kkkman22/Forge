#!/usr/bin/env node
/**
 * Staleness checker — classifies docs by freshness based on frontmatter `updated` date.
 * Exit codes: 0 = clean (or warnings only), 1 = error/critical staleness, 2 = critical, 3 = internal error.
 * CI mode: critical/invalid → exit 1; warning → exit 0 + ::warning:: annotation.
 */
import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseFrontmatter } from "../src/docs-governance/frontmatter/parser.js";
import { classifyStaleness } from "../src/docs-governance/staleness.js";
import { computeExitResult } from "../src/docs-governance/cli/_runtime.js";
import {
  formatDiagnostics,
  formatGitHubAnnotations,
  formatNdjson,
} from "../src/docs-governance/reporter/diagnostic.js";
import { formatHelp } from "../src/docs-governance/cli/_help.js";
import { loadConfigWithDefaults } from "../src/docs-governance/config.js";
import { walkMdFiles, shouldExcludeIndex } from "../src/docs-governance/cli/scan-files.js";
import type { DiagnosticRecord, DocPath, Severity } from "../src/docs-governance/types.js";

const SCRIPT_NAME = "check-docs-staleness";

// ── Args ──

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(
    formatHelp(SCRIPT_NAME, "Classify docs by freshness based on frontmatter updated date.", [
      "--json     Output diagnostics as NDJSON",
      "--ci       GitHub Actions mode (annotations + stricter exit codes)",
      "--help     Show this help message",
    ]),
  );
  process.exit(0);
}

const jsonMode = args.includes("--json");
const ciMode = args.includes("--ci");

// ── Staleness to severity mapping ──

function stalenessToSeverity(
  status: ReturnType<typeof classifyStaleness>,
): Severity | null {
  switch (status) {
    case "critical":
      return "error";
    case "warning":
      return "warning";
    case "invalid":
      return "error";
    case "fresh":
      return null;
  }
}

// ── Main ──

const rootDir = resolve(process.cwd());
const docsDir = join(rootDir, "docs");

// Load config
let config;
try {
  const configPath = join(rootDir, ".forge/config.md");
  const configRaw = readFileSync(configPath, "utf-8");
  config = loadConfigWithDefaults(configRaw);
} catch {
  config = loadConfigWithDefaults("");
}

const today = new Date();

const result = computeExitResult(() => {
  const files = walkMdFiles(docsDir, { excludeFn: shouldExcludeIndex });
  const diagnostics: DiagnosticRecord[] = [];

  for (const filePath of files) {
    const relPath = relative(rootDir, filePath) as DocPath;
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      diagnostics.push({
        script: SCRIPT_NAME,
        severity: "error",
        file: relPath,
        message: `Cannot read file: ${relPath}`,
      });
      continue;
    }

    const parsed = parseFrontmatter(content);
    if (!parsed.frontmatter) {
      // Files without valid frontmatter are not checked for staleness
      continue;
    }

    const status = classifyStaleness(
      parsed.frontmatter,
      today,
      config.staleness,
      relPath,
    );

    const severity = stalenessToSeverity(status);
    if (severity === null) continue; // fresh — skip

    diagnostics.push({
      script: SCRIPT_NAME,
      severity,
      file: relPath,
      message: status === "invalid"
        ? `Invalid or future-dated "updated" field: "${parsed.frontmatter.updated}"`
        : `Document is ${status === "critical" ? "critically stale" : "stale"} (${parsed.frontmatter.updated})`,
      extra: { staleness: status },
    });
  }

  return diagnostics;
});

if (jsonMode) {
  process.stdout.write(`${formatNdjson(result.diagnostics)}\n`);
} else {
  const output = formatDiagnostics(result.diagnostics);
  process.stdout.write(`${output}\n`);
}

if (ciMode) {
  const annotations = formatGitHubAnnotations(result.diagnostics);
  if (annotations) process.stdout.write(`${annotations}\n`);
}

if (result.error) {
  process.stderr.write(`${result.error.message}\n`);
}

process.exit(result.exitCode);
