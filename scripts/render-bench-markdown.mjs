#!/usr/bin/env node
/**
 * render-bench-markdown.mjs — Render a benchmark comparison report as Markdown.
 *
 * Reads a JSON array produced by `extract-bench-json.mjs` from stdin or
 * the first argument and emits a Markdown table suitable for PR comments.
 *
 * Usage:
 *   node scripts/extract-bench-json.mjs /tmp/main.json /tmp/pr.json \
 *     | node scripts/render-bench-markdown.mjs
 */

import { readFileSync } from "node:fs";

let input = "";
if (process.argv[2] && process.argv[2] !== "-") {
  input = readFileSync(process.argv[2], "utf-8");
} else {
  input = readFileSync(0, "utf-8");
}

const rows = JSON.parse(input);

const header = [
  "| Benchmark | Baseline mean (ms) | PR mean (ms) | Ratio | Status |",
  "| --- | ---: | ---: | ---: | :---: |",
];
const body = rows.map((r) => {
  const status = r.regression ? "❌ regression" : "✅ ok";
  return `| ${r.benchmark} | ${r.baselineMean.toFixed(4)} | ${r.prMean.toFixed(4)} | ${r.ratio.toFixed(2)}× | ${status} |`;
});

console.log(header.concat(body).join("\n"));
