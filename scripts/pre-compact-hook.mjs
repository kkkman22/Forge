#!/usr/bin/env node
// category: internal-only
/**
 * pre-compact-hook.mjs — Blocks context compression when more than N tasks
 * have been completed since the last restatement checkpoint.
 *
 * Exit codes:
 *   0 = allow compression (pass through)
 *   2 = block compression (too many tasks without restate)
 *
 * @see design.md#b5-precompact-hookr13
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const CWD = process.cwd();

// --- Shared frontmatter parsing ---

/**
 * Extract YAML frontmatter text from a markdown file.
 * Returns the text between --- delimiters, or undefined.
 */
function readFrontmatter(filePath) {
  if (!existsSync(filePath)) return undefined;
  const content = readFileSync(filePath, "utf-8");
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  return fmMatch?.[1];
}

/**
 * Read a field value from frontmatter text.
 * Returns undefined if field not found.
 */
function frontmatterField(frontmatter, field) {
  if (!frontmatter) return undefined;
  const lineRegex = new RegExp(`^${field}:\\s*(.+)$`, "m");
  const match = frontmatter.match(lineRegex);
  return match?.[1]?.trim();
}

// --- Config ---

// Cache config frontmatter to avoid double-read
let _configFrontmatter;
function configField(field) {
  if (_configFrontmatter === undefined) {
    _configFrontmatter = readFrontmatter(resolve(CWD, ".forge", "config.md"));
  }
  return frontmatterField(_configFrontmatter, field);
}

// --- Status parsing ---

/**
 * Read current_task from .forge/status.md frontmatter.
 */
function readCurrentTask() {
  const fm = readFrontmatter(resolve(CWD, ".forge", "status.md"));
  if (!fm) return undefined;
  const match = fm.match(/^current_task:\s*"?([^"\n]+)"?/m);
  return match?.[1]?.trim();
}

// --- Task counting ---

/**
 * Count completed tasks in a progress file.
 * Recognizes two formats:
 *   - `- [x]` checkbox style
 *   - `Status: DONE` / `Status: COMPLETE` style
 */
function countCompletedTasks(progressPath) {
  if (!existsSync(progressPath)) return 0;
  const content = readFileSync(progressPath, "utf-8");

  // Count checkbox completions
  const checkboxMatches = content.match(/^- \[x\]/gm);
  const checkboxCount = checkboxMatches ? checkboxMatches.length : 0;

  // Count Status: DONE / Status: COMPLETE markers
  const statusMatches = content.match(/^[\s-]*Status:\s*(?:DONE|COMPLETE)\s*$/gm);
  const statusCount = statusMatches ? statusMatches.length : 0;

  return checkboxCount + statusCount;
}

// --- Last restatement ---

/**
 * Read last-restatement.json. Returns the tasks_completed_count for the
 * matching spec, or 0 if file missing or spec doesn't match.
 */
function readLastRestatementCount(spec) {
  const restatementPath = resolve(CWD, ".forge", "state", "last-restatement.json");
  if (!existsSync(restatementPath)) return 0;

  try {
    const data = JSON.parse(readFileSync(restatementPath, "utf-8"));
    // Only use count if spec matches
    if (data.spec === spec) {
      return typeof data.tasks_completed_count === "number"
        ? data.tasks_completed_count
        : 0;
    }
    // Spec doesn't match => treat as 0 (no restate for current spec)
    return 0;
  } catch {
    return 0;
  }
}

// --- Main logic ---

function main() {
  // Step 1: Check if hook is enabled
  if (configField("forge_pre_compact_hook") === "off") {
    process.exit(0);
  }

  // Step 2: Determine active spec from status.md
  const spec = readCurrentTask();
  if (!spec) {
    // No current task — nothing to check
    process.exit(0);
  }

  // Step 3: Read progress file and count completed tasks
  const progressPath = resolve(CWD, ".forge", "progress", `${spec}.md`);
  if (!existsSync(progressPath)) {
    // No progress file — silent pass
    process.exit(0);
  }

  const completedCount = countCompletedTasks(progressPath);

  // Step 4: Read threshold from config
  const thresholdStr = configField("forge_pre_compact_threshold_tasks");
  const threshold = Number.parseInt(thresholdStr ?? "3", 10);
  const N = Number.isNaN(threshold) ? 3 : threshold;

  // Step 5: Read last restatement count
  const restatedCount = readLastRestatementCount(spec);

  // Step 6: Compare
  const tasksSinceRestate = completedCount - restatedCount;

  if (tasksSinceRestate >= N) {
    // Block compression
    const message = [
      `请先运行 progress 更新（最近 ${tasksSinceRestate} 个任务后未 restate），再 /compact。`,
      "执行步骤：",
      "  1. 重读 .forge/progress/<active>.md",
      "  2. 更新 .forge/state/last-restatement.json",
      "  3. 重试 /compact",
    ].join("\n");

    process.stderr.write(message + "\n");
    process.exit(2);
  }

  // Allow compression
  process.exit(0);
}

main();
