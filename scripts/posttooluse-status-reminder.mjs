#!/usr/bin/env node

/**
 * PostToolUse hook: remind to update progress after code modification.
 *
 * Checks if .forge/status.md (or .forge/status/ directory) exists.
 * If so, outputs a reminder to update .forge/progress/ task status.
 *
 * Migrated from inline shell command in plugin.json PostToolUse hook.
 *
 * Usage: node scripts/posttooluse-status-reminder.mjs
 *
 * Exit codes: 0 (always — fail-open)
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

const CWD = process.cwd();

try {
  // --help support
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`Usage: node scripts/posttooluse-status-reminder.mjs

  PostToolUse hook: reminds to update .forge/progress/ after code changes.

  Checks if .forge/status.md (or .forge/status/ directory) exists.
  If so, outputs a reminder to update task status.

  Exit codes: 0 (always — fail-open)`);
    process.exit(0);
  }

  const statusFile = join(CWD, ".forge", "status.md");
  const statusDir = join(CWD, ".forge", "status");

  if (existsSync(statusDir) || existsSync(statusFile)) {
    console.log("📝 代码已修改。请记得更新 .forge/progress/ 中的任务状态。");
  }
} catch {
  // fail-open: exit 0 on any error
}

process.exit(0);
