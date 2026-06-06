#!/usr/bin/env node

/**
 * Stop hook: check for incomplete tasks in .forge/progress/.
 *
 * Scans all .md files in .forge/progress/ for unchecked checkboxes.
 * Outputs a warning if incomplete tasks remain, or a completion suggestion
 * if all tasks are done. Exits 0 always (fail-open).
 *
 * Migrated from inline shell command in plugin.json Stop hook.
 *
 * Usage: node scripts/stop-incomplete-tasks.mjs
 *
 * Exit codes: 0 (always — fail-open)
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CWD = process.cwd();
const PROGRESS_DIR = join(CWD, ".forge", "progress");

try {
  if (!existsSync(PROGRESS_DIR)) {
    process.exit(0);
  }

  const files = readdirSync(PROGRESS_DIR).filter((f) => f.endsWith(".md"));
  if (files.length === 0) {
    process.exit(0);
  }

  let incompleteCount = 0;
  for (const file of files) {
    const content = readFileSync(join(PROGRESS_DIR, file), "utf-8");
    const matches = content.match(/^- \[ \]/gm);
    if (matches) {
      incompleteCount += matches.length;
    }
  }

  if (incompleteCount > 0) {
    console.log("⚠️ 仍有未完成的任务。下次会话可使用 /forge resume 恢复上下文。");
  } else {
    console.log("✅ 任务已完成。建议运行 /forge learn 沉淀本次开发经验。");
  }
} catch {
  // fail-open: exit 0 on any error
}

process.exit(0);
