#!/usr/bin/env node
/**
 * forge-read-injection-scanner.js — PostToolUse hook for Read
 *
 * Scans Read tool results for prompt injection patterns.
 * Fail-open design: always exits 0, outputs warnings to stderr as JSON.
 *
 * Trigger: PostToolUse matcher "Read"
 * Excludes: .forge/reviews/, .forge/knowledge/, hook source files, SECURITY.md
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

const COMPRESSION_SURVIVAL_PATTERNS = [
  { name: "compression-when", re: /when\s+(summariz|compress|condens|abbreviat)/i },
  { name: "retain-when", re: /retain\s+(this|the\s+following|above)\s+(when|if|during)/i },
  { name: "do-not-remove", re: /do\s+not\s+(remove|omit|exclude|delete|summarize)/i },
  { name: "always-include", re: /always\s+include\s+(this|the|in)/i },
  { name: "preserve-this", re: /preserve\s+(this|the\s+following|above)/i },
  { name: "important-directive", re: /important:\s+(do\s+not|never|always|must)/i },
  { name: "critical-essential", re: /this\s+(is|must\s+be)\s+(critical|essential|required|mandatory)/i },
];

// Invisible Unicode detection using \\u escapes to avoid literal range issues.
// Ranges: U+200B-200F (ZW/direction), U+202A-202E (RTL override), U+FEFF (BOM),
// U+00AD (soft hyphen), U+2060 (word joiner), U+E0000-E007F (tag block via surrogate pair)
var INVISIBLE_UNICODE_BMP_RE = new RegExp("[\\u200B-\\u200F\\u202A-\\u202E\\uFEFF\\u00AD\\u2060]");
var TAG_BLOCK_RE = new RegExp("\\uDB40[\\uDC00-\\uDC7F]");
function hasInvisibleUnicode(s) {
  return INVISIBLE_UNICODE_BMP_RE.test(s) || TAG_BLOCK_RE.test(s);
}

// Markdown link danger patterns
const MD_LINK_DANGERS = [
  { name: "javascript-uri", re: /\[.*?\]\(\s*javascript\s*:/i },
  { name: "data-uri-non-image", re: /\[.*?\]\(\s*data:(?!image\/)/i },
  { name: "credentials-in-url", re: /https?:\/\/[^/\s]+:[^/\s]+@/i },
  { name: "token-in-query", re: /[?&](token|key|secret|password|api_key|apikey)=\S+/i },
];

// Exclusion paths — do not scan
const EXCLUDED_PATHS = [
  ".forge/reviews/",
  ".forge/knowledge/",
  "SECURITY.md",
];

// Exclude hook source files by name
const EXCLUDED_FILES = [
  "forge-prompt-guard.js",
  "forge-read-injection-scanner.js",
];

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(chunks.join("")));
    process.stdin.on("error", reject);
  });
}

function isExcluded(filePath) {
  if (!filePath) return false;
  for (const excluded of EXCLUDED_PATHS) {
    if (filePath.includes(excluded)) return true;
  }
  const basename = filePath.split("/").pop() || "";
  for (const name of EXCLUDED_FILES) {
    if (basename === name) return true;
  }
  return false;
}

function scanContent(content) {
  const matched = [];

  // Standard injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.re.test(content)) {
      matched.push(pattern.name);
    }
  }

  // Compression survival patterns
  for (const pattern of COMPRESSION_SURVIVAL_PATTERNS) {
    if (pattern.re.test(content)) {
      matched.push(pattern.name);
    }
  }

  // Invisible Unicode
  if (hasInvisibleUnicode(content)) {
    matched.push("invisible-unicode");
  }

  // Markdown link dangers
  for (const pattern of MD_LINK_DANGERS) {
    if (pattern.re.test(content)) {
      matched.push(pattern.name);
    }
  }

  return matched;
}

function classifySeverity(matchCount) {
  return matchCount >= 3 ? "HIGH" : "LOW";
}

async function main() {
  try {
    const input = await readStdin();
    if (!input) process.exit(0);

    const data = JSON.parse(input);
    const toolName = data.tool_name || "";

    // Only activate for Read
    if (toolName !== "Read") {
      process.exit(0);
    }

    // Check exclusion by file path (from tool_input if available)
    const filePath = (data.tool_input && data.tool_input.file_path) || "";
    if (isExcluded(filePath)) {
      process.exit(0);
    }

    // Get content from tool_result
    const toolResult = data.tool_result || "";
    if (!toolResult || typeof toolResult !== "string") process.exit(0);

    const patterns = scanContent(toolResult);
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
