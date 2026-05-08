#!/usr/bin/env node
// category: internal-only
/**
 * extract-bench-json.mjs — Parse vitest bench JSON and compare against a baseline.
 *
 * Inputs:
 *   arg 1: path to the baseline JSON (e.g. from main branch)
 *   arg 2: path to the PR JSON
 *   --threshold=<ratio>: (optional) failure ratio; default 1.20 (20% slower)
 *
 * Vitest bench JSON format (as of 3.x) contains one file per benchmark
 * file with a list of `benchmarks` each carrying a `name` and a `result`
 * with `mean` / `p99` / `hz`.
 *
 * Output:
 *   - JSON-formatted comparison array to stdout for machine consumption
 *   - Exit 1 if any benchmark is slower than baseline * threshold
 *   - Exit 0 otherwise
 *
 * Example:
 *   npx vitest bench --run --outputJson=/tmp/pr.json
 *   git stash && git checkout main
 *   npx vitest bench --run --outputJson=/tmp/main.json
 *   git checkout - && git stash pop
 *   node scripts/extract-bench-json.mjs /tmp/main.json /tmp/pr.json --threshold=1.20
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: extract-bench-json.mjs <baseline.json> <pr.json> [--threshold=<n>]");
  process.exit(2);
}

const [baselinePath, prPath, ...rest] = args;
let threshold = 1.2;
for (const flag of rest) {
  if (flag.startsWith("--threshold=")) {
    const n = Number(flag.slice("--threshold=".length));
    if (Number.isFinite(n) && n > 1) threshold = n;
  }
}

/**
 * Normalise a vitest bench JSON report into a flat map keyed by
 * `<file>::<describe>::<bench>`. Each value is the mean time in
 * milliseconds.
 */
function loadBench(path) {
  const raw = JSON.parse(readFileSync(path, "utf-8"));
  const out = new Map();
  // Vitest 3.x returns `files` (deprecated) or `testResults`; normalise both.
  const entries = raw.files ?? raw.testResults ?? raw;
  for (const file of Array.isArray(entries) ? entries : Object.values(entries)) {
    const fileName = file.filepath ?? file.name ?? "unknown";
    walk(file, fileName, out, []);
  }
  return out;
}

function walk(node, fileName, out, path) {
  const tasks = node.tasks ?? node.children ?? [];
  for (const task of tasks) {
    if (task.type === "suite") {
      walk(task, fileName, out, [...path, task.name]);
    } else if (task.result?.benchmark) {
      const b = task.result.benchmark;
      const key = `${fileName}::${[...path, task.name].join(" > ")}`;
      // Pick the most representative metric available.
      const mean = b.mean ?? b.time ?? b.hz ? 1000 / b.hz : null;
      out.set(key, mean);
    } else if (task.result) {
      // Fallback shape: use `mean` directly from result.
      const mean = task.result.mean ?? null;
      if (mean !== null) {
        const key = `${fileName}::${[...path, task.name].join(" > ")}`;
        out.set(key, mean);
      }
    }
  }
}

const baseline = loadBench(baselinePath);
const pr = loadBench(prPath);

const report = [];
let hasRegression = false;
for (const [key, prMean] of pr) {
  const baselineMean = baseline.get(key);
  if (baselineMean === undefined || prMean === null) continue;
  const ratio = prMean / baselineMean;
  const regression = ratio > threshold;
  if (regression) hasRegression = true;
  report.push({
    benchmark: key,
    baselineMean,
    prMean,
    ratio,
    regression,
    threshold,
  });
}

console.log(JSON.stringify(report, null, 2));
if (hasRegression) {
  process.exit(1);
}
process.exit(0);
