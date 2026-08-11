#!/usr/bin/env node

// metrics-recorder.mjs
// Records skill invocation metrics to .tinkerman/.metrics/<YYYY-MM>.ndjson
// Called by UserPromptSubmit hook with: node scripts/metrics-recorder.mjs <skill> <source>
// Zero runtime dependencies.

import { mkdirSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const METRICS_DIR = join(ROOT, ".tinkerman", ".metrics");

const skill = process.argv[2] || "unknown";
const source = process.argv[3] || "manual";

if (!existsSync(METRICS_DIR)) {
  mkdirSync(METRICS_DIR, { recursive: true });
}

const now = new Date();
const dateStr = now.toISOString().split("T")[0];
const record = JSON.stringify({
  ts: now.toISOString(),
  skill,
  source,
});

const filePath = join(METRICS_DIR, `${dateStr.slice(0, 7)}.ndjson`);
appendFileSync(filePath, record + "\n");
