#!/usr/bin/env node

/**
 * TaskCreated lifecycle hook.
 *
 * When a task is created during build, reads .forge/plans/ for the latest
 * plan file and outputs a task summary as additionalContext.
 *
 * Fail-open: exits 0 on any condition (no plan, unreadable file, etc.).
 *
 * Usage: node scripts/task-created-hook.mjs
 *
 * Exit codes: 0 (always — fail-open)
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CWD = process.cwd();
const PLANS_DIR = join(CWD, ".forge", "plans");

try {
  if (!existsSync(PLANS_DIR)) {
    process.exit(0);
  }

  // Find the most recently modified plan file
  const files = readdirSync(PLANS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({
      name: f,
      path: join(PLANS_DIR, f),
      mtime: statSync(join(PLANS_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    process.exit(0);
  }

  const planContent = readFileSync(files[0].path, "utf-8");

  // Extract task headings and their checkbox items
  const lines = planContent.split("\n");
  const tasks = [];
  let currentTask = null;

  for (const line of lines) {
    const taskMatch = line.match(/^##\s+(Task\s+\d+.*)/i) || line.match(/^##\s+(.+)$/);
    if (taskMatch) {
      if (currentTask) {
        tasks.push(currentTask);
      }
      currentTask = { title: taskMatch[1], items: [] };
      continue;
    }

    if (currentTask) {
      const itemMatch = line.match(/^- \[[ x]\]\s+(.+)/);
      if (itemMatch) {
        currentTask.items.push(itemMatch[1]);
      }
    }
  }

  if (currentTask) {
    tasks.push(currentTask);
  }

  if (tasks.length === 0) {
    process.exit(0);
  }

  // Output as additionalContext summary
  const summary = tasks
    .map((t) => {
      const count = t.items.length;
      return `${t.title} (${count} item${count !== 1 ? "s" : ""})`;
    })
    .join("; ");

  console.log(`📋 Plan context: ${summary}`);
} catch {
  // fail-open: exit 0 on any error
}

process.exit(0);
