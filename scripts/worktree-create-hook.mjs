#!/usr/bin/env node

/**
 * WorktreeCreate lifecycle hook.
 *
 * Records worktree path and branch to .forge/progress/worktrees.json
 * when a new worktree is created. Auto-creates .forge/progress/ directory
 * if it doesn't exist.
 *
 * Fail-open: exits 0 on any condition.
 *
 * Environment variables (provided by Claude Code):
 *   WORKTREE_PATH — path to the new worktree
 *   WORKTREE_BRANCH — branch name of the new worktree
 *
 * Usage: node scripts/worktree-create-hook.mjs
 *
 * Exit codes: 0 (always — fail-open)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CWD = process.cwd();
const PROGRESS_DIR = join(CWD, ".forge", "progress");
const WORKTREES_FILE = join(PROGRESS_DIR, "worktrees.json");

try {
  const wtPath = process.env.WORKTREE_PATH;
  const wtBranch = process.env.WORKTREE_BRANCH;

  if (!wtPath) {
    process.exit(0);
  }

  // Auto-create .forge/progress/
  mkdirSync(PROGRESS_DIR, { recursive: true });

  // Read existing or create empty
  let data = { worktrees: [] };
  if (existsSync(WORKTREES_FILE)) {
    try {
      data = JSON.parse(readFileSync(WORKTREES_FILE, "utf-8"));
    } catch {
      // Corrupted — start fresh
      data = { worktrees: [] };
    }
  }

  // Append new entry
  data.worktrees.push({
    path: wtPath,
    branch: wtBranch || "unknown",
    created: new Date().toISOString().slice(0, 10),
  });

  writeFileSync(WORKTREES_FILE, JSON.stringify(data, null, 2), "utf-8");
} catch {
  // fail-open: exit 0 on any error
}

process.exit(0);
