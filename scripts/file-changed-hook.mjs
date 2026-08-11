#!/usr/bin/env node
// file-changed-hook.mjs — FileChanged hook for spec-lock/progress monitoring (R16)
//
// Reads JSON input from stdin (Claude Code hook protocol).
// Monitors .tinkerman/state/spec-lock and .tinkerman/progress/<active>.md for changes.
// When a relevant file changes, outputs a systemMessage with active spec info.
// Never blocks — always exits 0.
//
// Input: { session_id, cwd, hook_event_name: "FileChanged", file_path, event }
// Output: { systemMessage: "..." } or nothing (exit 0 silently)

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readStdin } from "./lib/read-stdin.mjs";

const FORGE_ROOT_ENV = process.env.FORGE_ROOT;

function findForgeRoot(cwd) {
  // Allow override via FORGE_ROOT env var (for testing)
  if (FORGE_ROOT_ENV) return FORGE_ROOT_ENV;

  let dir = cwd;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, ".tinkerman"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function parseStatusYaml(statusContent) {
  // Simple frontmatter parser for .tinkerman/status.md
  const frontmatterMatch = statusContent.match(
    /^---\s*\n([\s\S]*?)\n---/,
  );
  if (!frontmatterMatch) return {};

  const yaml = frontmatterMatch[1];
  const result = {};

  for (const line of yaml.split("\n")) {
    const match = line.match(/^\s*([\w.]+):\s*"?(.*?)"?\s*$/);
    if (match) {
      result[match[1]] = match[2];
    }
  }

  return result;
}

function getActiveTask(forgeRoot) {
  const statusPath = join(forgeRoot, ".tinkerman", "status.md");
  if (!existsSync(statusPath)) return null;

  try {
    const content = readFileSync(statusPath, "utf-8");
    const parsed = parseStatusYaml(content);
    return parsed.current_task || null;
  } catch {
    return null;
  }
}

function isSpecLockFile(filePath, forgeRoot) {
  if (!forgeRoot) return false;
  const expected = join(forgeRoot, ".tinkerman", "state", "spec-lock");
  return filePath === expected;
}

function isActiveProgressFile(filePath, forgeRoot, activeTask) {
  if (!forgeRoot || !activeTask) return false;
  const expected = join(forgeRoot, ".tinkerman", "progress", `${activeTask}.md`);
  return filePath === expected;
}

async function main() {
  let input;
  try {
    const buf = await readStdin();
    if (buf.length === 0) process.exit(0);
    input = JSON.parse(buf.toString("utf-8"));
  } catch {
    process.exit(0);
  }

  const cwd = input.cwd || process.cwd();
  const filePath = input.file_path;
  if (!filePath) {
    process.exit(0);
  }

  const forgeRoot = findForgeRoot(cwd);
  if (!forgeRoot) {
    process.exit(0);
  }

  const activeTask = getActiveTask(forgeRoot);

  let message = "";

  if (isSpecLockFile(filePath, forgeRoot)) {
    message = activeTask
      ? `spec-lock 文件已变更。当前活跃 spec: ${activeTask}`
      : "spec-lock 文件已变更";
  } else if (isActiveProgressFile(filePath, forgeRoot, activeTask)) {
    message = `进度文件已变更。当前活跃任务: ${activeTask}`;
  }

  if (message) {
    process.stdout.write(JSON.stringify({ systemMessage: message }));
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
