#!/usr/bin/env node

/**
 * TeammateIdle hook: check phase and warn if review/decide is active.
 *
 * Reads .tinkerman/status.md (or latest .tinkerman/status/*.md) to determine
 * current phase. If phase is "review" or "decide", outputs a warning
 * that idle teammates should continue working.
 *
 * Migrated from inline shell command in plugin.json TeammateIdle hook.
 *
 * Usage: node scripts/teammate-idle-phase-check.mjs
 *
 * Exit codes: 0 (always — fail-open)
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CWD = process.cwd();

try {
  const statusDir = join(CWD, ".tinkerman", "status");
  const statusFile = join(CWD, ".tinkerman", "status.md");

  let targetFile;

  if (existsSync(statusDir) && existsSync(statusFile) === false) {
    // Use latest file from status directory
    const files = readdirSync(statusDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({ name: f, mtime: statSync(join(statusDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    targetFile = files.length > 0 ? join(statusDir, files[0].name) : null;
  } else if (existsSync(statusFile)) {
    targetFile = statusFile;
  } else {
    process.exit(0);
  }

  if (!targetFile) {
    process.exit(0);
  }

  const content = readFileSync(targetFile, "utf-8");

  // Extract phase from frontmatter
  const phaseMatch = content.match(/^phase:\s*"?([^"\n]*)"?\s*$/m);
  if (!phaseMatch) {
    process.exit(0);
  }

  const phase = phaseMatch[1].trim();

  if (phase === "review" || phase === "decide") {
    console.log("队友空闲。请检查是否所有评审/决策维度都已完成输出，未完成的队友应继续工作。");
  }
} catch {
  // fail-open: exit 0 on any error
}

process.exit(0);
