#!/usr/bin/env node
// category: internal-only
/**
 * append-baseline.mjs — Append the latest benchmark run to
 * `.tinkerman/knowledge/metrics.md`.
 *
 * Appends a compact single-line summary per benchmark into a section
 * named `## performance_baselines`. Older entries are truncated beyond
 * `--keep=<N>` (default 30) so the file never grows unbounded.
 *
 * Usage:
 *   node scripts/append-baseline.mjs bench-result.json [--keep=30]
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [path, ...flags] = process.argv.slice(2);
if (!path) {
  console.error("Usage: append-baseline.mjs <bench.json> [--keep=<n>]");
  process.exit(2);
}

let keep = 30;
for (const flag of flags) {
  if (flag.startsWith("--keep=")) {
    const n = Number(flag.slice("--keep=".length));
    if (Number.isFinite(n) && n > 0) keep = n;
  }
}

const METRICS_PATH = ".tinkerman/knowledge/metrics.md";
const HEADER = "## performance_baselines";

const now = new Date().toISOString();
const raw = JSON.parse(readFileSync(path, "utf-8"));

// Flatten to { benchmark, mean } entries so we record a single summary
// line per bench per run.
const entries = [];
const files = raw.files ?? raw.testResults ?? raw;
for (const file of Array.isArray(files) ? files : Object.values(files)) {
  const fileName = file.filepath ?? file.name ?? "unknown";
  walk(file, fileName);
}

function walk(node, fileName, path = []) {
  const tasks = node.tasks ?? node.children ?? [];
  for (const task of tasks) {
    if (task.type === "suite") {
      walk(task, fileName, [...path, task.name]);
    } else {
      const mean = task.result?.benchmark?.mean ?? task.result?.mean ?? null;
      if (mean !== null) {
        entries.push({ benchmark: `${fileName}::${[...path, task.name].join(" > ")}`, mean });
      }
    }
  }
}

const line = `${now} | ${entries.length} benchmarks | ${entries
  .map((e) => `${e.benchmark}=${e.mean.toFixed(4)}ms`)
  .join("; ")}`;

// Read existing metrics.md, append to (or create) the section.
let content = existsSync(METRICS_PATH) ? readFileSync(METRICS_PATH, "utf-8") : "";
let section;
const sectionIdx = content.indexOf(HEADER);

if (sectionIdx === -1) {
  content = `${content}${content.endsWith("\n") ? "" : "\n"}\n${HEADER}\n\n`;
  section = "";
} else {
  const after = content.slice(sectionIdx);
  const nextHeader = after.slice(HEADER.length).search(/^## /m);
  if (nextHeader === -1) {
    section = after.slice(HEADER.length).trimStart();
    content = content.slice(0, sectionIdx + HEADER.length).trimEnd();
  } else {
    section = after.slice(HEADER.length, HEADER.length + nextHeader).trimStart();
    const before = content.slice(0, sectionIdx + HEADER.length).trimEnd();
    const rest = after.slice(HEADER.length + nextHeader);
    content = `${before}\n\nSECTION_PLACEHOLDER\n\n${rest}`;
  }
}

const existingLines = section.split("\n").filter((l) => l.trim() !== "");
const updated = [line, ...existingLines].slice(0, keep).join("\n");
if (content.includes("SECTION_PLACEHOLDER")) {
  content = content.replace("SECTION_PLACEHOLDER", updated);
} else {
  content = `${content.trimEnd()}\n${updated}\n`;
}

writeFileSync(METRICS_PATH, content);
console.log(`Appended ${entries.length} benchmark baselines to ${METRICS_PATH}`);
