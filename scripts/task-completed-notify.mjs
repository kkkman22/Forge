#!/usr/bin/env node

/**
 * TaskCompleted hook: notify team task completion.
 *
 * Outputs a message prompting the team lead to aggregate teammate
 * outputs and check for merge needs.
 *
 * Migrated from inline shell command in plugin.json TaskCompleted hook.
 *
 * Usage: node scripts/task-completed-notify.mjs
 *
 * Exit codes: 0 (always — fail-open)
 */

try {
  console.log("✅ 团队任务已完成。负责人请汇总队友输出并检查是否需要合并发现。");
} catch {
  // fail-open: exit 0 on any error
}

process.exit(0);
