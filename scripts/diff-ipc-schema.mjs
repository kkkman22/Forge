/**
 * diff-ipc-schema.mjs — Compare IPC schema baseline vs current output
 *
 * Compatibility contract (non-breaking = OK, breaking = fail):
 *   (a) baseline event types must be a subset of current event types
 *   (b) baseline field names AND their typeof types must match in current
 *   (c) new fields in current are allowed (extension)
 *   (d) new event types in current are allowed (extension)
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

  // baselineEvents: event -> Map<field, typeof value>
  const baselineEvents = new Map();
  for (const line of baselineLines) {
    try {
      const obj = JSON.parse(line);
      if (!obj.event) continue;
      const fieldTypes = new Map();
      for (const [key, val] of Object.entries(obj)) {
        fieldTypes.set(key, typeof val);
      }
      baselineEvents.set(obj.event, fieldTypes);
    } catch { /* skip malformed */ }
  }

  // currentEvents: event -> Map<field, Set<typeof values>>
  const currentEvents = new Map();
  for (const line of currentLines) {
    try {
      const obj = JSON.parse(line);
      if (!obj.event) continue;
      if (!currentEvents.has(obj.event)) currentEvents.set(obj.event, new Map());
      const existing = currentEvents.get(obj.event);
      for (const [key, val] of Object.entries(obj)) {
        if (!existing.has(key)) existing.set(key, new Set());
        existing.get(key).add(typeof val);
      }
    } catch { /* skip malformed */ }
  }

  for (const [event, baselineFields] of baselineEvents) {
    const currentFields = currentEvents.get(event);
    if (!currentFields) {
      issues.push(`missing event type: ${event}`);
      continue;
    }
    for (const [field, baselineType] of baselineFields) {
      const currentTypes = currentFields.get(field);
      if (!currentTypes) {
        issues.push(`missing field '${field}' in event '${event}'`);
        continue;
      }
      if (!currentTypes.has(baselineType)) {
        issues.push(`type mismatch: field '${field}' in event '${event}' expected ${baselineType}, got [${[...currentTypes].join(", ")}]`);
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
