#!/usr/bin/env node

/**
 * bash-ban-raw.mjs — PreToolUse hook for Bash tool.
 *
 * Intercepts bare file-read commands (cat/head/tail/grep/rg/wc) to force
 * usage of Read/Grep/Glob tools instead, preventing raw output from flooding
 * the context window.
 *
 * Smart filtering:
 *   BLOCK: single-file reads (cat file, grep pattern file, head file, etc.)
 *   ALLOW: piped commands (find ... | grep), npm/git/node, escape hatch
 *
 * Escape hatch: touch /tmp/bash-raw-unlock-$PPID (10 min expiry)
 *
 * Fail-open: exits 0 on any parse error or unexpected condition.
 */

import { existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

/**
 * Extract the command string from the tool input JSON passed via stdin.
 * Claude Code passes the tool input as JSON on stdin for PreToolUse hooks.
 */
async function readCommandFromStdin() {
  try {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const input = Buffer.concat(chunks).toString("utf-8");
    if (!input) return null;
    const parsed = JSON.parse(input);
    return parsed?.tool_input?.command ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Escape hatch
// ---------------------------------------------------------------------------

/**
 * Check if the escape hatch file exists and is fresh (< 10 minutes old).
 */
function isEscapeHatchActive() {
  const escapeFile = join(tmpdir(), `bash-raw-unlock-${process.ppid}`);
  try {
    if (!existsSync(escapeFile)) return false;
    const stats = statSync(escapeFile);
    const ageMs = Date.now() - stats.mtimeMs;
    return ageMs < 10 * 60 * 1000; // 10 minutes
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Command classification
// ---------------------------------------------------------------------------

/**
 * Determine if a command should be blocked.
 *
 * Rules:
 *   1. If command contains a pipe `|`, ALLOW (piped = batch analysis)
 *   2. If command starts with cat/head/tail/less/more followed by a file arg, BLOCK
 *   3. If command starts with grep/rg/ag but has NO pipe, BLOCK
 *   4. If command starts with wc followed by a file arg, BLOCK
 *   5. Everything else: ALLOW
 */
function shouldBlock(command) {
  const trimmed = command.trim();

  // Rule 1: Piped commands are always allowed
  if (trimmed.includes("|")) return false;

  // Rule 2: Single file reads — cat, head, tail, less, more
  if (/^(cat|head|tail|less|more)\s+\S/.test(trimmed)) return true;

  // Rule 3: Single grep (non-piped) — grep/rg/ag with a target
  if (/^(grep|rg|ag)\s+[^|]*\S/.test(trimmed)) return true;

  // Rule 4: wc with file arg
  if (/^wc\s+\S/.test(trimmed)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const command = await readCommandFromStdin();
  if (!command) {
    // Can't determine command — fail-open
    process.exit(0);
  }

  // Check escape hatch
  if (isEscapeHatchActive()) {
    process.exit(0);
  }

  if (shouldBlock(command)) {
    process.stderr.write(
      "BLOCKED: Use Read/Grep/Glob tools instead of shell file-read commands.\n" +
      "Escape hatch: touch /tmp/bash-raw-unlock-$PPID (10 min)\n",
    );
    process.exit(2);
  }

  process.exit(0);
}

main();
