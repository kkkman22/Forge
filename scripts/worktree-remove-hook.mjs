#!/usr/bin/env node

/**
 * WorktreeRemove lifecycle hook.
 *
 * Removes the worktree entry from .forge/progress/worktrees.json
 * when a worktree is removed.
 *
 * Fail-open: exits 0 on any condition.
 *
 * Environment variables (provided by Claude Code):
 *   WORKTREE_PATH — path to the removed worktree
 *
 * Usage: node scripts/worktree-remove-hook.mjs
 *
 * Exit codes: 0 (always — fail-open)
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CWD = process.cwd();
const PROGRESS_DIR = join(CWD, ".forge", "progress");
const WORKTREES_FILE = join(PROGRESS_DIR, "worktrees.json");

try {
  const wtPath = process.env.WORKTREE_PATH;

  if (!wtPath || !existsSync(WORKTREES_FILE)) {
    process.exit(0);
  }

  let data;
  try {
    data = JSON.parse(readFileSync(WORKTREES_FILE, "utf-8"));
  } catch {
    // Corrupted — nothing to remove
    process.exit(0);
  }

  if (!data.worktrees || !Array.isArray(data.worktrees)) {
    process.exit(0);
  }

  // Remove matching entry
  data.worktrees = data.worktrees.filter((wt) => wt.path !== wtPath);

  writeFileSync(WORKTREES_FILE, JSON.stringify(data, null, 2), "utf-8");
} catch {
  // fail-open: exit 0 on any error
}

process.exit(0);
