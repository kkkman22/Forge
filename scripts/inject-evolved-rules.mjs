#!/usr/bin/env node
// category: internal-only
/**
 * inject-evolved-rules.mjs — Capped SessionStart evolved-rules injector.
 *
 * Reads .forge/knowledge/evolved-rules.md with a 4KB byte limit.
 * Short-circuits to zero output when stdin signals subagent caller.
 * Fails open silently when file doesn't exist.
 *
 * @see https://code.claude.com/docs/en/hooks#common-input-fields
 */
import { readFileSync, statSync } from "node:fs";
import { shouldSkipForSubagent } from "./lib/hook-stdin-router.mjs";

const RULES_PATH = ".forge/knowledge/evolved-rules.md";
const MAX_BYTES = 4096;

(async () => {
  if (await shouldSkipForSubagent()) process.exit(0);

  try {
    statSync(RULES_PATH);
    const buf = readFileSync(RULES_PATH);
    process.stdout.write("=== Evolved Rules ===\n");
    if (buf.length <= MAX_BYTES) {
      process.stdout.write(buf);
    } else {
      process.stdout.write(buf.subarray(0, MAX_BYTES));
      process.stdout.write(`\n[... ${buf.length - MAX_BYTES} bytes truncated]\n`);
    }
  } catch {
    process.exit(0);
  }
})();
