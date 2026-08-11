#!/usr/bin/env node
// category: internal-only
/**
 * ultrareview-fallback.mjs — L0 review fallback (R9)
 *
 * Calls `claude ultrareview --json` as an L0 review mechanism when
 * all spec-check/quality-check/security-check subagents have failed.
 *
 * Behavior:
 *   1. Read config from .tinkerman/config.md frontmatter (regex parse)
 *   2. If review_use_ultrareview != true → exit 1
 *   3. Execute `claude ultrareview --json`
 *   4. Parse JSON output, map findings to P0-P3 severity
 *   5. Output JSON with findings array to stdout
 *
 * Failure paths:
 *   - claude not found → exit 1
 *   - non-zero exit from claude → exit 1
 *   - parse error → exit 1
 *   - config disabled → exit 1
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync as nodeExecFileSync } from "node:child_process";

// ── Config parsing ──

/**
 * Parse YAML frontmatter from .tinkerman/config.md.
 * Returns a Map of key→value strings.
 */
function parseConfigFrontmatter(configContent) {
  const fmMatch = configContent.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return new Map();

  const map = new Map();
  for (const line of fmMatch[1].split("\n")) {
    const kvMatch = line.match(/^(\S+):\s*(.+?)(?:\s+#.*)?$/);
    if (kvMatch) {
      map.set(kvMatch[1], kvMatch[2].trim());
    }
  }
  return map;
}

/**
 * Read and parse config. Returns the config Map.
 */
function readConfig(rootDir) {
  const configPath = resolve(rootDir, ".tinkerman/config.md");
  try {
    const content = readFileSync(configPath, "utf-8");
    return parseConfigFrontmatter(content);
  } catch {
    return null;
  }
}

// ── Main logic ──

/**
 * Run ultrareview fallback. Accepts optional inject for testing.
 */
function runUltrareviewFallback(opts = {}) {
  const {
    rootDir = process.env.FORGE_ROOT || process.cwd(),
    execFileSync = nodeExecFileSync,
  } = opts;

  // 1. Read config
  const config = readConfig(rootDir);
  if (!config) {
    process.stderr.write("Error: .tinkerman/config.md not found or unreadable.\n");
    process.exit(1);
  }

  const useUltrareview = config.get("review_use_ultrareview");
  if (useUltrareview !== "true") {
    process.stderr.write(
      `Error: review_use_ultrareview is ${useUltrareview || "unset"} (expected true).\n`,
    );
    process.exit(1);
  }

  // 2. Execute claude ultrareview --json
  let rawOutput;
  try {
    rawOutput = execFileSync("claude", ["ultrareview", "--json"], {
      encoding: "utf-8",
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    const e = err;
    if (e.code === "ENOENT") {
      process.stderr.write("Error: claude command not found on PATH.\n");
      process.exit(1);
    }
    // Non-zero exit from claude
    const stderr = (e.stderr || "").toString().trim();
    process.stderr.write(
      `Error: claude ultrareview exited with code ${e.status || "unknown"}${stderr ? ": " + stderr : ""}\n`,
    );
    process.exit(1);
  }

  // 3. Parse JSON output
  if (!rawOutput || !rawOutput.trim()) {
    process.stderr.write("Error: claude ultrareview returned empty output.\n");
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    process.stderr.write("Error: failed to parse JSON output from claude ultrareview.\n");
    process.exit(1);
  }

  // 4. Map findings to forge-review finding structure
  const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const findings = rawFindings.map((f) => ({
    severity: f.severity || "P3",
    file_path: f.file_path || "unknown",
    line: f.line ?? 0,
    message: f.message || "",
    category: f.category || "general",
  }));

  // 5. Output result to stdout
  const result = {
    source: "ultrareview",
    methodology: "ultrareview-fallback",
    summary: parsed.summary || "UltraReview completed.",
    findings,
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// Run when executed directly
runUltrareviewFallback();
