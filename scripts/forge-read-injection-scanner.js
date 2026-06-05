#!/usr/bin/env node
/**
 * forge-read-injection-scanner.js — PostToolUse hook for Read tool
 * Also detects compression-survival patterns and markdown link dangers.
 * Fail-open design: always exits 0, outputs warnings to stderr as JSON.
 */
"use strict";

var fs = require("fs");
var path = require("path");

// Load shared injection patterns
var PATTERNS_FILE = path.join(__dirname, "injection-patterns.json");
var INJECTION_PATTERNS = JSON.parse(fs.readFileSync(PATTERNS_FILE, "utf8")).map(function(p) {
  return { name: p.name, re: new RegExp(p.pattern, "i") };
});

// Read-specific: compression-survival patterns
// These target instructions designed to survive context summarization
var COMPRESSION_SURVIVAL_PATTERNS = [
  { name: "cs-retain-when", re: /when\s+(summariz|compress|condens|abbreviat)/i },
  { name: "cs-retain-this", re: /retain\s+(this|the)\s+(when|if|during)/i },
  { name: "cs-do-not-remove", re: /do\s+not\s+(remove|omit|exclude|delete|summarize)/i },
  { name: "cs-always-include", re: /always\s+include\s+(this|the)/i },
  { name: "cs-preserve", re: /preserve\s+(this|the\s+following|above)/i },
  { name: "cs-important-must", re: /important:\s+(do\s+not|never|always|must)/i },
  { name: "cs-this-critical", re: /this\s+(is|must\s+be)\s+(critical|essential|required|mandatory)/i },
];

// Read-specific: markdown link dangers
var MD_LINK_DANGERS = [
  { name: "md-javascript-uri", re: /javascript:/i },
  { name: "md-data-uri-unsafe", re: /data:(?!image\/)/i },
  { name: "md-url-credentials", re: /https?:\/\/[^/\s]+:[^/\s]+@/i },
  { name: "md-query-secret", re: /[?&](token|key|secret|password)=/i },
];

// Exclusion paths (read-path-specific)
var EXCLUDE_PATHS = [".forge/reviews/", ".forge/knowledge/", "SECURITY.md"];

var HIGH_SEVERITY_THRESHOLD = 3;

// Invisible Unicode (shared with prompt-guard)
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
    if (INJECTION_PATTERNS[i].re.test(content)) matches.push(INJECTION_PATTERNS[i].name);
  }
  for (var i = 0; i < COMPRESSION_SURVIVAL_PATTERNS.length; i++) {
    if (COMPRESSION_SURVIVAL_PATTERNS[i].re.test(content)) matches.push(COMPRESSION_SURVIVAL_PATTERNS[i].name);
  }
  for (var i = 0; i < MD_LINK_DANGERS.length; i++) {
    if (MD_LINK_DANGERS[i].re.test(content)) matches.push(MD_LINK_DANGERS[i].name);
  }
  return matches;
}

function isExcluded(filePath) {
  for (var i = 0; i < EXCLUDE_PATHS.length; i++) {
    if (filePath.includes(EXCLUDE_PATHS[i])) return true;
  }
  return false;
}

function classifySeverity(matchCount) {
  return matchCount >= HIGH_SEVERITY_THRESHOLD ? "HIGH" : "LOW";
}

async function main() {
  try {
    var input = JSON.parse(await readStdin());
    var toolName = input.tool_name || input.tool || "";

    if (toolName !== "Read") { process.exit(0); return; }

    var filePath = "";
    var toolInput = input.tool_input || input.params || {};
    if (typeof toolInput === "string") { filePath = toolInput; }
    else { filePath = toolInput.file_path || toolInput.path || ""; }

    if (isExcluded(filePath)) { process.exit(0); return; }

    var content = input.tool_result || input.result || "";
    if (typeof content !== "string") { content = JSON.stringify(content); }
    if (!content) { process.exit(0); return; }

    var matches = scanContent(content);
    var hasInvisible = hasInvisibleUnicode(content);

    if (matches.length > 0 || hasInvisible) {
      var severity = classifySeverity(matches.length + (hasInvisible ? 1 : 0));
      var result = {
        severity: severity,
        patterns: matches,
        invisible_unicode: hasInvisible,
        file: filePath,
        hook: "forge-read-injection-scanner"
      };
      process.stderr.write(JSON.stringify(result) + "\n");
    }
  } catch (e) {
    // Fail-open: never block on errors
  }
  process.exit(0);
}

main();
