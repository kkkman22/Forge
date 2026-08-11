#!/usr/bin/env node

/**
 * Stop hook: check for pending evolved rules.
 *
 * Scans .forge/knowledge/evolved-rules.md for PENDING status entries.
 * Outputs a warning with count if any pending rules exist.
 * Exits 0 always (fail-open).
 *
 * Migrated from inline shell command in plugin.json Stop hook.
 *
 * Usage: node scripts/stop-pending-rules.mjs
 *
 * Exit codes: 0 (always — fail-open)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CWD = process.cwd();
const RULES_FILE = join(CWD, ".forge", "knowledge", "evolved-rules.md");

try {
  if (!existsSync(RULES_FILE)) {
    process.exit(0);
  }

  const content = readFileSync(RULES_FILE, "utf-8");

  // Count PENDING occurrences (match "Status: PENDING" style patterns)
  const matches = content.match(/^.*PENDING.*$/gm);
  const count = matches ? matches.length : 0;

  if (count > 0) {
    console.log(`⚠️ 有 ${count} 条待审核的规则提案。运行 /tinkerman learn 查看并审批。`);
  }
} catch {
  // fail-open: exit 0 on any error
}

process.exit(0);
