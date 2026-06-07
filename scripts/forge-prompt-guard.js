#!/usr/bin/env node
/**
 * forge-prompt-guard.js — PreToolUse hook for Write/Edit targeting .forge/
 * Fail-open design: always exits 0, outputs warnings to stderr as JSON.
 * Trigger: PreToolUse matcher "Write|Edit"
 * Activation: target path contains ".forge/"
 * Exemption: CLAUDE_CODE_ENTRYPOINT env var set (native read-before-edit)
 */
"use strict";

import fs from "node:fs";
import path from "node:path";

// Load shared injection patterns
const PATTERNS_FILE = path.join(import.meta.dirname, "injection-patterns.json");
const INJECTION_PATTERNS = JSON.parse(fs.readFileSync(PATTERNS_FILE, "utf8")).map((p) => {
  return { name: p.name, re: new RegExp(p.pattern, "i") };
});

const HIGH_SEVERITY_THRESHOLD = 3;

// Invisible Unicode detection
const INVISIBLE_UNICODE_BMP_RE = new RegExp("[\\u200B-\\u200F\\u202A-\\u202E\\uFEFF\\u00AD\\u2060]");
const TAG_BLOCK_RE = new RegExp("\\uDB40[\\uDC00-\\uDC7F]");
function hasInvisibleUnicode(s) {
  return INVISIBLE_UNICODE_BMP_RE.test(s) || TAG_BLOCK_RE.test(s);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { chunks.push(chunk); });
    process.stdin.on("end", () => { resolve(chunks.join("")); });
    process.stdin.on("error", reject);
  });
}

function scanContent(content) {
  const matches = [];
  for (let i = 0; i < INJECTION_PATTERNS.length; i++) {
    const p = INJECTION_PATTERNS[i];
    if (p.re.test(content)) {
      matches.push(p.name);
    }
  }
  return matches;
}

function classifySeverity(matchCount) {
  return matchCount >= HIGH_SEVERITY_THRESHOLD ? "HIGH" : "LOW";
}

async function main() {
  try {
    // Skip if Claude Code has native protection
    if (process.env.CLAUDE_CODE_ENTRYPOINT) { process.exit(0); return; }

    const input = JSON.parse(await readStdin());
    const toolName = input.tool_name || input.tool || "";
    const toolInput = input.tool_input || input.params || {};

    // Only activate for Write/Edit on .forge/ paths
    if (toolName !== "Write" && toolName !== "Edit") { process.exit(0); return; }
    const targetPath = toolInput.file_path || toolInput.path || "";
    if (!targetPath.includes(".forge/")) { process.exit(0); return; }

    const content = toolInput.content || toolInput.new_string || "";
    if (!content) { process.exit(0); return; }

    const matches = scanContent(content);
    const hasInvisible = hasInvisibleUnicode(content);

    if (matches.length > 0 || hasInvisible) {
      const severity = classifySeverity(matches.length + (hasInvisible ? 1 : 0));
      const result = {
        severity: severity,
        patterns: matches,
        invisible_unicode: hasInvisible,
        file: targetPath,
        hook: "forge-prompt-guard"
      };
      process.stderr.write(JSON.stringify(result) + "\n");
    }
  } catch (e) {
    // Fail-open: never block on errors
  }
  process.exit(0);
}

main();
