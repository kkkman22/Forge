#!/usr/bin/env node
/**
 * forge-prompt-guard.js — PreToolUse hook for Write/Edit targeting .forge/
 * Fail-open design: always exits 0, outputs warnings to stderr as JSON.
 * Trigger: PreToolUse matcher "Write|Edit"
 * Activation: target path contains ".forge/"
 * Exemption: CLAUDE_CODE_ENTRYPOINT env var set (native read-before-edit)
 */
"use strict";

var fs = require("fs");
var path = require("path");

// Load shared injection patterns
var PATTERNS_FILE = path.join(__dirname, "injection-patterns.json");
var INJECTION_PATTERNS = JSON.parse(fs.readFileSync(PATTERNS_FILE, "utf8")).map(function(p) {
  return { name: p.name, re: new RegExp(p.pattern, "i") };
});

var HIGH_SEVERITY_THRESHOLD = 3;

// Invisible Unicode detection
var INVISIBLE_UNICODE_BMP_RE = new RegExp("[\\u200B-\\u200F\\u202A-\\u202E\\uFEFF\\u00AD\\u2060]");
var TAG_BLOCK_RE = new RegExp("\\uDB40[\\uDC00-\\uDC7F]");
function hasInvisibleUnicode(s) {
  return INVISIBLE_UNICODE_BMP_RE.test(s) || TAG_BLOCK_RE.test(s);
}

function readStdin() {
  return new Promise(function(resolve, reject) {
    var chunks = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", function(chunk) { chunks.push(chunk); });
    process.stdin.on("end", function() { resolve(chunks.join("")); });
    process.stdin.on("error", reject);
  });
}

function scanContent(content) {
  var matches = [];
  for (var i = 0; i < INJECTION_PATTERNS.length; i++) {
    var p = INJECTION_PATTERNS[i];
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

    var input = JSON.parse(await readStdin());
    var toolName = input.tool_name || input.tool || "";
    var toolInput = input.tool_input || input.params || {};

    // Only activate for Write/Edit on .forge/ paths
    if (toolName !== "Write" && toolName !== "Edit") { process.exit(0); return; }
    var targetPath = toolInput.file_path || toolInput.path || "";
    if (!targetPath.includes(".forge/")) { process.exit(0); return; }

    var content = toolInput.content || toolInput.new_string || "";
    if (!content) { process.exit(0); return; }

    var matches = scanContent(content);
    var hasInvisible = hasInvisibleUnicode(content);

    if (matches.length > 0 || hasInvisible) {
      var severity = classifySeverity(matches.length + (hasInvisible ? 1 : 0));
      var result = {
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
