/**
 * diff-ipc-schema.mjs — Compare IPC schema baseline vs current output
 *
 * Usage: node scripts/diff-ipc-schema.mjs <baseline.ndjson> <current.ndjson>
 * Exit 0 = compatible, non-zero = breaking change.
 */

import { readFileSync } from "node:fs";

/**
 * Compare two NDJSON files for IPC schema compatibility.
 * @param {string} baselinePath
 * @param {string} currentPath
 * @returns {{ ok: boolean, issues: string[] }}
 */
export function diffIpcSchema(baselinePath, currentPath) {
  const issues = [];

  const baselineLines = readFileSync(baselinePath, "utf-8").trim().split("\n").filter(Boolean);
  const currentLines = readFileSync(currentPath, "utf-8").trim().split("\n").filter(Boolean);

  const baselineEvents = new Map();
  for (const line of baselineLines) {
    try {
      const obj = JSON.parse(line);
      if (obj.event) baselineEvents.set(obj.event, Object.keys(obj));
    } catch { /* skip malformed */ }
  }

  const currentEvents = new Map();
  for (const line of currentLines) {
    try {
      const obj = JSON.parse(line);
      if (obj.event) {
        if (!currentEvents.has(obj.event)) currentEvents.set(obj.event, new Set());
        const existing = currentEvents.get(obj.event);
        for (const key of Object.keys(obj)) existing.add(key);
      }
    } catch { /* skip malformed */ }
  }

  // Check: all baseline event types must exist in current
  for (const [event, fields] of baselineEvents) {
    const currentFields = currentEvents.get(event);
    if (!currentFields) {
      issues.push(`missing event type: ${event}`);
      continue;
    }
    // Check: all baseline fields must exist in current for the same event type
    for (const field of fields) {
      if (!currentFields.has(field)) {
        issues.push(`missing field '${field}' in event '${event}'`);
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

// CLI mode
const [,, baseline, current] = process.argv;
if (baseline && current) {
  const result = diffIpcSchema(baseline, current);
  if (!result.ok) {
    process.stderr.write(`IPC schema diff FAILED:\n${result.issues.join("\n")}\n`);
    process.exit(1);
  }
  process.stdout.write("IPC schema diff OK\n");
  process.exit(0);
}
