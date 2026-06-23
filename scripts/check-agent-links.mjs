#!/usr/bin/env node
// category: user-facing
/**
 * check-agent-links.mjs — Agent symlink 完整性门禁。
 *
 * ADR-0010: `.claude/agents/` 全部为 symlink 指向 `agents/` 唯一源。
 * 本脚本校验每个 `.claude/agents/*.md`(排除 README.md)都是有效 symlink:
 *   1. 必须是 symlink(非实体文件)
 *   2. 目标必须是 ../../agents/<同名>.md
 *   3. 目标文件必须存在
 *
 * Exit 0 if clean, exit 1 if issues found.
 * Skippable via FORGE_SKIP_AGENT_LINKS=1 or [agent-links-skip] in commit message.
 *
 * 纯逻辑在 src/agent-links.ts(可测),本 CLI 为自包含薄包装
 * (与 check-bundle-sync.mjs 范式一致:.mjs 不 import .ts)。
 *
 * Usage: node scripts/check-agent-links.mjs
 *
 * @see src/agent-links.ts (testable core logic)
 */

import { execSync } from "node:child_process";
import { lstatSync, readlinkSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const CLAUDE_AGENTS_DIR = join(ROOT, ".claude", "agents");
const AGENTS_DIR = join(ROOT, "agents");
const EXPECTED_PREFIX = "../../agents/";

// ── Logging ──────────────────────────────────────────────────────────
function log(msg) {
  process.stdout.write(`${msg}\n`);
}
function logError(msg) {
  process.stderr.write(`${msg}\n`);
}

// ── Skip check ───────────────────────────────────────────────────────
function checkSkip() {
  if (process.env.FORGE_SKIP_AGENT_LINKS === "1") {
    log("⚠️  agent-links: SKIPPED (FORGE_SKIP_AGENT_LINKS=1)");
    return true;
  }
  try {
    const msg = execSync("git log -1 --format=%B", { encoding: "utf-8" }).trim();
    if (msg.includes("[agent-links-skip]")) {
      log("⚠️  agent-links: SKIPPED ([agent-links-skip] in commit message)");
      return true;
    }
  } catch {
    // no commits yet — skip
  }
  return false;
}

// ── Validation ───────────────────────────────────────────────────────
function isSymlink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function readLink(p) {
  try {
    return readlinkSync(p);
  } catch {
    return null;
  }
}

function validate() {
  if (!existsSync(CLAUDE_AGENTS_DIR)) {
    logError(`✗ .claude/agents/ 不存在: ${CLAUDE_AGENTS_DIR}`);
    return [{ file: ".claude/agents/", code: "DIR_MISSING", message: "目录不存在" }];
  }

  const files = readdirSync(CLAUDE_AGENTS_DIR)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort();

  const issues = [];
  for (const file of files) {
    const fullPath = join(CLAUDE_AGENTS_DIR, file);
    const expectedTarget = `${EXPECTED_PREFIX}${file}`;

    if (!isSymlink(fullPath)) {
      issues.push({
        file,
        code: "NOT_SYMLINK",
        message: `应为 symlink,实际是普通文件 — 改 agents/ 后运行: rm .claude/agents/${file} && ln -s ${expectedTarget} .claude/agents/${file}`,
      });
      continue;
    }

    const target = readLink(fullPath);
    if (target !== expectedTarget) {
      issues.push({
        file,
        code: "WRONG_TARGET",
        message: `symlink 目标错误: 期望 ${expectedTarget}, 实际 ${target}`,
      });
      continue;
    }

    const resolvedTarget = resolve(dirname(fullPath), target);
    if (!existsSync(resolvedTarget)) {
      issues.push({
        file,
        code: "BROKEN_TARGET",
        message: `symlink 目标不存在: ${target} (agents/${file} 缺失)`,
      });
    }
  }

  return issues;
}

// ── Main ─────────────────────────────────────────────────────────────
function showHelp() {
  console.log(`Usage: node scripts/check-agent-links.mjs [--help]

Agent symlink 完整性门禁 (ADR-0010)。校验 .claude/agents/*.md 都是有效
symlink 指向 ../../agents/<同名>.md 唯一源。

Exit 0 if clean, exit 1 if issues found.
Skippable via FORGE_SKIP_AGENT_LINKS=1 or [agent-links-skip] in commit message.

Options:
  --help, -h    Show this help message`);
}

function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    process.exit(0);
  }
  if (checkSkip()) process.exit(0);

  const issues = validate();

  if (issues.length === 0) {
    const count = readdirSync(CLAUDE_AGENTS_DIR).filter(
      (f) => f.endsWith(".md") && f !== "README.md"
    ).length;
    log(`✓ agent-links: ${count} 个 agent symlink 全部有效 (指向 agents/ 唯一源)`);
    process.exit(0);
  }

  logError(`✗ agent-links: 发现 ${issues.length} 个问题:\n`);
  for (const issue of issues) {
    logError(`  [${issue.code}] ${issue.file}`);
    logError(`      ${issue.message}\n`);
  }
  logError("修复指引: 改 agents/ 源文件后,确保 .claude/agents/ 是 symlink(非实体)。");
  logError("ADR-0010: agents/ 是唯一源,.claude/agents/ 全部 symlink 指向它。");
  process.exit(1);
}

main();
