#!/usr/bin/env node
/**
 * diff-ipc-schema.mjs — IPC NDJSON schema regression diff (Requirement 8.2 + 8.8).
 *
 * Usage: node scripts/diff-ipc-schema.mjs <baseline.ndjson> <current.ndjson>
 *
 * Compares two NDJSON files frame-by-frame. The CURRENT file is allowed to:
 *   - add new fields to existing event types (forward-compat per AC 8.2)
 *   - emit new event types (superset per AC 8.8)
 * The CURRENT file is NOT allowed to:
 *   - rename or remove fields that exist in baseline frames of the same event
 *   - change the JS-typeof of a baseline-known field
 *   - drop event types that exist in baseline
 *
 * Exits 0 on safe diff, 1 on regression.
 */

import { readFileSync } from "node:fs";

function parseNdjson(path) {
  const lines = readFileSync(path, "utf-8").split("\n").filter((l) => l.trim().length > 0);
  return lines.map((l) => JSON.parse(l));
}

function indexByEvent(frames) {
  const map = new Map();
  for (const f of frames) {
    const key = f.event ?? "<unknown>";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(f);
  }
  return map;
}

function fieldShape(frame) {
  const shape = {};
  for (const [k, v] of Object.entries(frame)) {
    shape[k] = typeofWithNull(v);
  }
  return shape;
}

function typeofWithNull(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

function diff(baseline, current) {
  const baselineByEvent = indexByEvent(baseline);
  const currentByEvent = indexByEvent(current);
  const errors = [];

  for (const [event, baselineFrames] of baselineByEvent) {
    const currentFrames = currentByEvent.get(event);
    if (!currentFrames || currentFrames.length === 0) {
      errors.push(`missing event type: "${event}" present in baseline but absent in current`);
      continue;
    }

    // Union of baseline shapes for this event.
    const expected = {};
    for (const f of baselineFrames) {
      for (const [k, t] of Object.entries(fieldShape(f))) {
        expected[k] = t;
      }
    }

    // Each current frame of this event must contain every expected field with
    // matching type (or null is permitted as a relaxation? — strict for now).
    for (let i = 0; i < currentFrames.length; i++) {
      const got = fieldShape(currentFrames[i]);
      for (const [field, expectedType] of Object.entries(expected)) {
        if (!(field in got)) {
          errors.push(
            `missing field "${field}" on event "${event}" frame #${i} (expected type ${expectedType})`,
          );
        } else if (got[field] !== expectedType) {
          errors.push(
            `type mismatch for field "${field}" on event "${event}" frame #${i}: expected ${expectedType}, got ${got[field]}`,
          );
        }
      }
    }
  }

  return errors;
}

function main() {
  const [, , baselinePath, currentPath] = process.argv;
  if (!baselinePath || !currentPath) {
    console.error("usage: diff-ipc-schema.mjs <baseline.ndjson> <current.ndjson>");
    process.exit(2);
  }

  const baseline = parseNdjson(baselinePath);
  const current = parseNdjson(currentPath);
  const errors = diff(baseline, current);

  if (errors.length > 0) {
    console.error("IPC schema regression detected:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("IPC schema diff OK (current is forward-compatible with baseline)");
}

main();
