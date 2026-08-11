#!/usr/bin/env node

import { appendFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** @type {string[]} */
export const CRITICAL_PATTERNS = [
  "workflow load failed",
  "workflow_runtime_unavailable",
  "L1 trigger",
  "stuck_timeout",
  "backpressure_unrelieved",
  "LineTooLargeError",
];

const HELP_TEXT = `
scan-recent-ci-logs.mjs — Scan recent CI workflow runs for resilience failure patterns.

Usage:
  node scripts/scan-recent-ci-logs.mjs --repo <owner/repo> [options]

Options:
  --repo <owner/repo>    GitHub repository (required)
  --count <N>            Number of recent runs to scan (default: 100)
  --branch <branch>      Filter to a specific branch
  --write-health         Append findings to .tinkerman/knowledge/tool-health.md
  --help, -h             Show this help message

Patterns scanned:
  ${CRITICAL_PATTERNS.join("\n  ")}

Output: JSON summary to stdout.

Exit codes:
  0  No critical patterns found
  1  Critical patterns found
`;

/**
 * @param {string[]} argv
 * @returns {{ repo: string, count: number, branch: string|null, writeHealth: boolean, help: boolean }}
 */
export function parseArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { repo: "", count: 100, branch: null, writeHealth: false, help: true };
  }

  const repoIdx = argv.indexOf("--repo");
  if (repoIdx === -1 || !argv[repoIdx + 1]) {
    throw new Error("Missing required argument: --repo <owner/repo>");
  }
  const repo = argv[repoIdx + 1];

  const countIdx = argv.indexOf("--count");
  const count = countIdx >= 0 ? Number.parseInt(argv[countIdx + 1], 10) : 100;

  const branchIdx = argv.indexOf("--branch");
  const branch = branchIdx >= 0 ? argv[branchIdx + 1] : null;

  const writeHealth = argv.includes("--write-health");

  return { repo, count, branch, writeHealth, help: false };
}

/**
 * @param {number} runId
 * @param {string} log
 * @returns {Array<{ run_id: number, pattern: string, log_line: string }>}
 */
export function matchPatterns(runId, log) {
  const results = [];
  const lines = log.split("\n");

  for (const line of lines) {
    for (const pattern of CRITICAL_PATTERNS) {
      if (line.includes(pattern)) {
        results.push({ run_id: runId, pattern, log_line: line.trim() });
      }
    }
  }

  return results;
}

/**
 * @param {Array<{ databaseId: number, status: string, conclusion: string, headBranch: string, createdAt: string, event: string }>} runs
 * @param {Array<{ run_id: number, pattern: string, log_line: string }>} allMatches
 * @returns {{ scanned_runs: number, failed_runs: number, matched_patterns: Array, pattern_counts: Record<string, number> }}
 */
export function buildSummary(runs, allMatches) {
  const failedRuns = runs.filter(
    (r) => r.status === "completed" && r.conclusion === "failure",
  );

  const patternCounts = /** @type {Record<string, number>} */ ({});
  for (const m of allMatches) {
    patternCounts[m.pattern] = (patternCounts[m.pattern] || 0) + 1;
  }

  return {
    scanned_runs: runs.length,
    failed_runs: failedRuns.length,
    matched_patterns: allMatches,
    pattern_counts: patternCounts,
  };
}

/**
 * @param {string} repo
 * @param {number} count
 * @param {string|null} branch
 * @returns {Array}
 */
function fetchRuns(repo, count, branch) {
  const args = [
    "run", "list",
    "--repo", repo,
    "--limit", String(count),
    "--json", "databaseId,status,conclusion,headBranch,createdAt,event",
  ];
  if (branch) {
    args.push("--branch", branch);
  }
  const raw = execFileSync("gh", args, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  return JSON.parse(raw);
}

/**
 * @param {string} repo
 * @param {number} runId
 * @returns {string}
 */
function fetchRunLogs(repo, runId) {
  try {
    return execFileSync("gh", ["run", "view", String(runId), "--repo", repo, "--log"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

/**
 * @param {{ scanned_runs: number, failed_runs: number, matched_patterns: Array<{ run_id: number, pattern: string, log_line: string }>, pattern_counts: Record<string, number> }} summary
 */
function writeHealthFile(summary) {
  const healthPath = resolve(ROOT, ".tinkerman", "knowledge", "tool-health.log");
  // The event log is gitignored and lazily created on first write — ensure
  // the parent dir exists, then append. (Previously refused to create the
  // file because the tracked .md was seed-only; that no longer applies.)
  mkdirSync(dirname(healthPath), { recursive: true });

  const timestamp = new Date().toISOString();
  const lines = [
    "",
    `<!-- scan-recent-ci-logs ${timestamp} -->`,
    `### CI Log Scan (${timestamp})`,
    `- scanned_runs: ${summary.scanned_runs}`,
    `- failed_runs: ${summary.failed_runs}`,
    `- pattern_counts: ${JSON.stringify(summary.pattern_counts)}`,
  ];

  for (const m of summary.matched_patterns.slice(0, 20)) {
    lines.push(`  - run ${m.run_id}: [${m.pattern}] ${m.log_line.slice(0, 200)}`);
  }

  appendFileSync(healthPath, `${lines.join("\n")}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP_TEXT.trim());
    process.exit(0);
  }

  const runs = fetchRuns(args.repo, args.count, args.branch);
  const failedRuns = runs.filter(
    (r) => r.status === "completed" && r.conclusion === "failure",
  );

  const allMatches = [];
  for (const run of failedRuns) {
    const log = fetchRunLogs(args.repo, run.databaseId);
    if (log) {
      allMatches.push(...matchPatterns(run.databaseId, log));
    }
  }

  const summary = buildSummary(runs, allMatches);
  console.log(JSON.stringify(summary, null, 2));

  if (args.writeHealth && allMatches.length > 0) {
    writeHealthFile(summary);
  }

  process.exit(allMatches.length > 0 ? 1 : 0);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  });
}
