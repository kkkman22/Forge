#!/usr/bin/env node
/**
 * forge-prompt-guard.js — PreToolUse hook for Write/Edit targeting .forge/
 *
 * Scans content for prompt injection patterns before writing to .forge/ paths.
 * Fail-open design: always exits 0, outputs warnings to stderr as JSON.
 *
 * Trigger: PreToolUse matcher "Write|Edit"
 * Activation: target path contains ".forge/"
 * Exemption: CLAUDE_CODE_ENTRYPOINT env var set (native read-before-edit)
 */

"use strict";

const INJECTION_PATTERNS = [
  // Instruction override
  { name: "instruction-override", re: /ignore\s+(previous|all|above|earlier)\s+instructions?/i },
  { name: "disregard-instructions", re: /disregard\s+(previous|above)\s+(instructions?|rules)/i },
  { name: "forget-all", re: /forget\s+(everything|all)/i },

  // Role manipulation
  { name: "role-manipulation", re: /you\s+are\s+now\s+a/i },
  { name: "new-instructions", re: /new\s+instructions?:/i },
  { name: "your-role", re: /your\s+(new\s+)?role\s+(is|should\s+be)/i },

  // System tag injection
  { name: "system-tag", re: /<system>|<assistant>|<human>|<user>|\[SYSTEM\]|\[INST\]|<<SYS>>|<\|im_start\|>/i },
  { name: "html-comment-tag", re: /<!--\s*(system|assistant)/i },

  // Tool call injection
  { name: "tool-call-injection", re: /use\s+(the\s+)?(Read|Write|Edit|Bash)\s+tool/i },
  { name: "call-function", re: /call\s+(the\s+)?function/i },
  { name: "execute-command", re: /execute\s+(the\s+)?(following\s+)?command/i },

  // Jailbreak/DAN
  { name: "dan-mode", re: /DAN\s+(mode|jailbreak)/i },
  { name: "developer-mode", re: /developer\s+mode/i },
  { name: "bypass-restrictions", re: /bypass\s+(your|the)\s+(restrictions|rules|guidelines)/i },
];

// Invisible Unicode detection using \\u escapes to avoid literal range issues.
// Ranges: U+200B-200F (ZW/direction), U+202A-202E (RTL override), U+FEFF (BOM),
// U+00AD (soft hyphen), U+2060 (word joiner), U+E0000-E007F (tag block via surrogate pair)
var INVISIBLE_UNICODE_BMP_RE = new RegExp("[\\u200B-\\u200F\\u202A-\\u202E\\uFEFF\\u00AD\\u2060]");
var TAG_BLOCK_RE = new RegExp("\\uDB40[\\uDC00-\\uDC7F]");
function hasInvisibleUnicode(s) {
  return INVISIBLE_UNICODE_BMP_RE.test(s) || TAG_BLOCK_RE.test(s);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(chunks.join("")));
    process.stdin.on("error", reject);
  });
}

function scanContent(content) {
  const matched = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.re.test(content)) {
      matched.push(pattern.name);
    }
  }
  // Check invisible Unicode
  if (hasInvisibleUnicode(content)) {
    matched.push("invisible-unicode");
  }
  return matched;
}

function classifySeverity(matchCount) {
  return matchCount >= 3 ? "HIGH" : "LOW";
}

async function main() {
  // Exemption: Claude Code native environment
  if (process.env.CLAUDE_CODE_ENTRYPOINT) {
    process.exit(0);
  }

  try {
    const input = await readStdin();
    if (!input) process.exit(0);

    const data = JSON.parse(input);
    const toolName = data.tool_name || "";
    const toolInput = data.tool_input || {};

    // Only activate for Write/Edit
    if (toolName !== "Write" && toolName !== "Edit") {
      process.exit(0);
    }

    // Only activate for .forge/ paths
    const filePath = toolInput.file_path || "";
    if (!filePath.includes(".forge/")) {
      process.exit(0);
    }

    // Extract content
    const content = toolName === "Write" ? toolInput.content || "" : toolInput.new_string || "";
    if (!content) process.exit(0);

    const patterns = scanContent(content);
    if (patterns.length === 0) process.exit(0);

    const severity = classifySeverity(patterns.length);
    const result = { severity, patterns, file: filePath };

    process.stderr.write(JSON.stringify(result) + "\n");
  } catch {
    // Fail-open: any error exits 0
  }

  process.exit(0);
}

main();
