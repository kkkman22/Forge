#!/usr/bin/env node
// config-changed-hook.mjs — ConfigChange hook for Forge plugin.
//
// Monitors key configuration files and outputs additionalContext prompts
// when they change, so Claude re-reads updated configuration.
//
// Input (stdin JSON from Claude Code ConfigChange event):
//   { session_id, hook_event_name: "ConfigChange", changed_files: string[] }
// Output: { additionalContext: "..." } or nothing (silent exit)
// Exit code: always 0 (fail-open)

import { resolve } from "node:path";
import { readStdin } from "./lib/read-stdin.mjs";

/**
 * Watched configuration files — extend this list to monitor more files.
 * Matching uses endsWith so both relative and absolute paths work.
 */
const WATCHED_FILES = [
  {
    pattern: ".forge/config.md",
    message: "📝 Forge 配置已变更（{files}），建议重新读取 .forge/config.md",
  },
  {
    pattern: ".claude/settings.json",
    message: "📝 Claude Code 配置已变更（{files}），建议检查影响范围",
  },
];

function showHelp() {
  console.log(`config-changed-hook — Forge ConfigChange hook

用法:
  node scripts/config-changed-hook.mjs          # 正常由 Claude Code 事件触发
  node scripts/config-changed-hook.mjs --help   # 显示帮助

监听文件:
${WATCHED_FILES.map((w) => `  - ${w.pattern}`).join("\n")}

行为:
  - 当监听的配置文件变化时，输出 additionalContext 提示
  - 未监听的文件变化时静默退出
  - 任何错误都不阻断工作流（fail-open，始终 exit 0）

详见: .kiro/specs/configchange-hook/`);
}

async function main() {
  // --help support (§2.8 Scripts as Black Box)
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    process.exit(0);
  }

  let input;
  try {
    const buf = await readStdin();
    if (buf.length === 0) process.exit(0);
    input = JSON.parse(buf.toString("utf-8"));
  } catch {
    // Malformed or no input — silent exit (fail-open)
    process.exit(0);
  }

  const changedFiles = input.changed_files;
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    process.exit(0);
  }

  function safeMatches(filePath, pattern) {
    if (typeof filePath !== "string") return false;
    if (filePath.includes("\0")) return false;
    return resolve(filePath).endsWith(pattern);
  }

  function sanitizeFilename(filePath) {
    return filePath.replace(/[\x00-\x1f\x7f]/g, "").trim();
  }

  // Match changed files against watched patterns
  const matchedMessages = [];

  for (const watched of WATCHED_FILES) {
    const matches = changedFiles.filter((f) => safeMatches(f, watched.pattern));
    if (matches.length > 0) {
      const safeMatches = matches.map(sanitizeFilename);
      matchedMessages.push(
        watched.message.replace("{files}", safeMatches.join(", ")),
      );
    }
  }

  if (matchedMessages.length === 0) {
    process.exit(0);
  }

  // Output additionalContext with all matched messages combined
  const output = {
    additionalContext: matchedMessages.join("\n"),
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

// Defensive: catch any unhandled rejection to guarantee fail-open
main().catch(() => process.exit(0));
