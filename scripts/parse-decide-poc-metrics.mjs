#!/usr/bin/env node

/**
 * parse-decide-poc-metrics.mjs — Parse JSONL output from run-decide-poc.sh into metrics table
 * Usage: node scripts/parse-decide-poc-metrics.mjs <topic-id>
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const TOPIC_ID = process.argv[2];
if (!TOPIC_ID) {
  console.error("Usage: node scripts/parse-decide-poc-metrics.mjs <topic-id>");
  process.exit(1);
}

if (!/^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$/.test(TOPIC_ID)) {
  console.error(`Invalid topic-id '${TOPIC_ID}'. Only alphanumeric characters and hyphens allowed.`);
  process.exit(1);
}

const OUT_DIR = ".tinkerman/runs/decide-poc";

function parseJsonl(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null; // skip malformed JSONL lines
      }
    })
    .filter(Boolean);

  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let failures = 0;

  for (const entry of lines) {
    if (entry.type === "result") {
      inputTokens += entry.usage?.input_tokens ?? 0;
      outputTokens += entry.usage?.output_tokens ?? 0;
    }
    if (entry.type === "error") {
      failures++;
    }
  }

  totalTokens = inputTokens + outputTokens;

  return { totalTokens, inputTokens, outputTokens, failures };
}

function getDuration(label) {
  try {
    const d = readFileSync(join(OUT_DIR, `${label}.duration`), "utf-8").trim();
    return parseInt(d, 10);
  } catch {
    return null;
  }
}

function formatDuration(seconds) {
  if (seconds === null) return "N/A";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s}s`;
}

// Collect all data
const files = readdirSync(OUT_DIR).filter(
  (f) => f.startsWith(TOPIC_ID) && f.endsWith(".jsonl"),
);

const rows = [];

for (const file of files) {
  const label = file.replace(".jsonl", "");
  const modeMatch = label.match(/-(dag|teams)-/);
  const iterMatch = label.match(/(iter\d+)$/);
  const mode = modeMatch ? modeMatch[1] : "unknown";
  const iter = iterMatch ? iterMatch[1] : "unknown";

  const metrics = parseJsonl(join(OUT_DIR, file));
  const duration = getDuration(label);

  rows.push({
    mode,
    iter,
    duration,
    totalTokens: metrics.totalTokens,
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    failures: metrics.failures,
  });
}

// Output markdown table
console.log(`# PoC Metrics: ${TOPIC_ID}\n`);
console.log(
  "| Mode | Iter | Duration | Total Tokens | Input | Output | Failures |",
);
console.log(
  "|------|------|----------|-------------|-------|--------|----------|",
);

for (const row of rows) {
  console.log(
    `| ${row.mode} | ${row.iter} | ${formatDuration(row.duration)} | ${row.totalTokens.toLocaleString()} | ${row.inputTokens.toLocaleString()} | ${row.outputTokens.toLocaleString()} | ${row.failures} |`,
  );
}

// Summary
const dagRows = rows.filter((r) => r.mode === "dag");
const teamsRows = rows.filter((r) => r.mode === "teams");

if (dagRows.length > 0 && teamsRows.length > 0) {
  const avgDagTokens =
    dagRows.reduce((s, r) => s + r.totalTokens, 0) / dagRows.length;
  const avgTeamsTokens =
    teamsRows.reduce((s, r) => s + r.totalTokens, 0) / teamsRows.length;
  const avgDagDuration =
    dagRows.reduce((s, r) => s + (r.duration ?? 0), 0) / dagRows.length;
  const avgTeamsDuration =
    teamsRows.reduce((s, r) => s + (r.duration ?? 0), 0) / teamsRows.length;

  console.log("");
  console.log("## Summary\n");
  console.log(
    `| Metric | DAG (avg) | Teams (avg) | Delta |`,
  );
  console.log(
    `|--------|-----------|-------------|-------|`,
  );
  console.log(
    `| Tokens | ${Math.round(avgDagTokens).toLocaleString()} | ${Math.round(avgTeamsTokens).toLocaleString()} | ${avgTeamsTokens > avgDagTokens ? "+" : ""}${Math.round(((avgTeamsTokens - avgDagTokens) / avgDagTokens) * 100)}% |`,
  );
  console.log(
    `| Duration | ${formatDuration(Math.round(avgDagDuration))} | ${formatDuration(Math.round(avgTeamsDuration))} | ${avgTeamsDuration > avgDagDuration ? "+" : ""}${Math.round(((avgTeamsDuration - avgDagDuration) / avgDagDuration) * 100)}% |`,
  );
}
