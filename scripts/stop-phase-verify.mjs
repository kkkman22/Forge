#!/usr/bin/env node

/**
 * Stop hook: verify active phase before session ends.
 *
 * Reads .forge/status.md and warns if the current phase is active
 * (not "completed" or empty), reminding the user to verify their
 * last change.
 *
 * Migrated from inline shell command in plugin.json Stop hook.
 *
 * Usage: node scripts/stop-phase-verify.mjs
 *
 * Exit codes: 0 (always — fail-open)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CWD = process.cwd();
const STATUS_FILE = join(CWD, ".forge", "status.md");

try {
  if (!existsSync(STATUS_FILE)) {
    process.exit(0);
  }

  const content = readFileSync(STATUS_FILE, "utf-8");

  // Extract phase from frontmatter
  const phaseMatch = content.match(/^phase:\s*"?([^"\n]*)"?\s*$/m);
  if (!phaseMatch) {
    process.exit(0);
  }

  const phase = phaseMatch[1].trim();

  if (phase && phase !== "completed" && phase !== "") {
    console.log(`⚠️ Phase: ${phase} — did you verify your last change? Run the relevant test/lint command before stopping.`);
  }
} catch {
  // fail-open: exit 0 on any error
}

process.exit(0);
