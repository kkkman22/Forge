#!/usr/bin/env node
/**
 * check-coverage-regression.mjs — Detect coverage regressions between PR and main.
 *
 * Compares coverage-summary.json from the current branch against main branch.
 * Fails if any metric regresses by ≥ 1%.
 *
 * Usage:
 *   node scripts/check-coverage-regression.mjs [current.json] [main.json]
 *   node scripts/check-coverage-regression.mjs  # uses defaults: coverage/coverage-summary.json
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REGRESSION_THRESHOLD = 1; // percent

function loadSummary(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch (err) {
    console.error(`Failed to load coverage summary: ${filePath}`);
    console.error(err.message);
    process.exit(1);
  }
}

function getMetrics(summary) {
  const total = summary.total;
  return {
    statements: total.statements.pct,
    branches: total.branches.pct,
    functions: total.functions.pct,
    lines: total.lines.pct,
  };
}

const currentPath = process.argv[2] || join(process.cwd(), "coverage", "coverage-summary.json");
const mainPath = process.argv[3] || join(process.cwd(), "coverage-main", "coverage-summary.json");

const current = loadSummary(currentPath);
const main = loadSummary(mainPath);

const currentMetrics = getMetrics(current);
const mainMetrics = getMetrics(main);

let hasRegression = false;

console.log("Coverage regression check:");
console.log("Metric       | Main   | PR     | Delta");
console.log("-------------|--------|--------|-------");

for (const metric of ["statements", "branches", "functions", "lines"]) {
  const mainVal = mainMetrics[metric];
  const prVal = currentMetrics[metric];
  const delta = prVal - mainVal;
  const marker = delta < -REGRESSION_THRESHOLD ? " ⚠️ REGRESSION" : delta < 0 ? " (minor)" : " ✅";
  console.log(
    `${metric.padEnd(13)}| ${String(mainVal).padStart(6)} | ${String(prVal).padStart(6)} | ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}${marker}`,
  );

  if (delta < -REGRESSION_THRESHOLD) {
    hasRegression = true;
  }
}

if (hasRegression) {
  console.error(`\n❌ Coverage regression detected (≥ ${REGRESSION_THRESHOLD}% drop in one or more metrics)`);
  process.exit(1);
}

console.log("\n✅ No coverage regressions detected");
process.exit(0);
