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

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PROJECT_ROOT = process.env.FORGE_PROJECT_ROOT
  ? resolve(process.env.FORGE_PROJECT_ROOT)
  : process.cwd();
const PROGRESS_DIR = join(PROJECT_ROOT, ".forge", "progress");
const WORKTREES_FILE = join(PROGRESS_DIR, "worktrees.json");
const LOCK_FILE = WORKTREES_FILE + ".lock";

function acquireLock(maxRetries = 10, delayMs = 100) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      writeFileSync(LOCK_FILE, `${process.pid}:${Date.now()}`, { flag: "wx" });
      return true;
    } catch {
      if (i < maxRetries - 1) {
        // Simple synchronous delay
        const start = Date.now();
        while (Date.now() - start < delayMs) { /* spin */ }
      }
    }
  }
  return false; // fail-open: proceed without lock after timeout
}

function releaseLock() {
  try {
    unlinkSync(LOCK_FILE);
  } catch {
    // ignore
  }
}

try {
  const wtPath = process.env.WORKTREE_PATH;

  if (!wtPath || !existsSync(WORKTREES_FILE)) {
    process.exit(0);
  }

  const locked = acquireLock();
  let data;
  try {
    data = JSON.parse(readFileSync(WORKTREES_FILE, "utf-8"));
  } catch {
    // Corrupted — nothing to remove
    if (locked) releaseLock();
    process.exit(0);
  }

  if (!data.worktrees || !Array.isArray(data.worktrees)) {
    if (locked) releaseLock();
    process.exit(0);
  }

  // Remove matching entry
  data.worktrees = data.worktrees.filter((wt) => wt.path !== wtPath);

  writeFileSync(WORKTREES_FILE, JSON.stringify(data, null, 2), "utf-8");
  if (locked) releaseLock();
} catch {
  // fail-open: exit 0 on any error
  releaseLock();
}

process.exit(0);
