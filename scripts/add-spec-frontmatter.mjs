#!/usr/bin/env node

/**
 * add-spec-frontmatter.mjs — One-off script to batch-add frontmatter
 * to existing .kiro/specs/ requirements.md files.
 *
 * INTERNAL USE ONLY — not for CI or regular workflow.
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { readdir } from "node:fs/promises";

// Resolve to main repo's .kiro/specs/ (parent of worktree)
const MAIN_REPO = "/Users/king/code/Forge";
const KIRO_SPECS_DIR = join(MAIN_REPO, ".kiro", "specs");

// Deferred specs list from requirements.md §3
const DEFERRED_SPECS = {
  "ccbp-hardening-phase2": "已被 frozen-zone-structured-feedback 部分覆盖",
  "ccbp-inspired-hardening": "同上",
  "claude-md-self-evolution": "依赖 Self-Evolution Protocol 成熟度",
  "plan-document-streamlining": "当前 Plan 输出格式可接受",
  "remaining-backlog": "随日常开发自然消化",
  "skill-behavioral-guardrails": "等待 skill 系统稳定",
  "skill-document-optimization": "token-budget-compression 已覆盖核心需求",
  "skills-cross-pollination": "等待 skill 生态成熟",
  "plugin-distribution": "插件生态非近期路线图，Q3 重新评估",
  "plugin-init-experience": "依赖 plugin-distribution",
  "parallel-status-tracking": "agent-teams 普及后再评估",
  "review-comment-bitbucket": "Bitbucket 集成优先级低于 GitHub/GitLab",
};

// Get git log dates for a spec directory
function getGitDates(specDir) {
  try {
    const firstCommit = execSync(
      `git log --diff-filter=A --follow --format=%cs -- ".kiro/specs/${specDir}" 2>/dev/null | tail -1`,
      { encoding: "utf-8", cwd: MAIN_REPO }
    ).trim();

    const lastCommit = execSync(
      `git log --format=%cs -1 -- ".kiro/specs/${specDir}" 2>/dev/null`,
      { encoding: "utf-8", cwd: MAIN_REPO }
    ).trim();

    return {
      created: firstCommit || "2026-01-01",
      updated: lastCommit || "2026-01-01",
    };
  } catch {
    return { created: "2026-01-01", updated: "2026-01-01" };
  }
}

async function processSpecs() {
  const entries = await readdir(KIRO_SPECS_DIR, { withFileTypes: true });
  let processed = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_")) continue;

    const reqPath = join(KIRO_SPECS_DIR, entry.name, "requirements.md");
    if (!existsSync(reqPath)) continue;

    const content = await readFile(reqPath, "utf-8");
    const trimmed = content.trimStart();

    // Skip if already has frontmatter
    if (trimmed.startsWith("---")) {
      skipped++;
      continue;
    }

    // Determine status and dates
    const isDeferred = entry.name in DEFERRED_SPECS;
    const dates = getGitDates(entry.name);

    let frontmatter;
    if (isDeferred) {
      frontmatter = [
        "---",
        `name: ${entry.name}`,
        "status: deferred",
        `created: "${dates.created}"`,
        `updated: "${dates.updated}"`,
        `deferred_reason: "${DEFERRED_SPECS[entry.name]}"`,
        'deferred_date: "2026-05-29"',
        "---",
        "",
      ].join("\n");
    } else {
      frontmatter = [
        "---",
        `name: ${entry.name}`,
        "status: in_progress",
        `created: "${dates.created}"`,
        `updated: "${dates.updated}"`,
        "---",
        "",
      ].join("\n");
    }

    // Prepend frontmatter to the file
    const newContent = frontmatter + content;
    await writeFile(reqPath, newContent, "utf-8");

    const status = isDeferred ? "deferred" : "in_progress";
    console.log(`  ${entry.name}: ${status} (created: ${dates.created}, updated: ${dates.updated})`);
    processed++;
  }

  console.log(`\nProcessed: ${processed}, Skipped (has frontmatter): ${skipped}`);
}

processSpecs().catch(console.error);
