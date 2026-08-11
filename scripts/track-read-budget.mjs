#!/usr/bin/env node

/**
 * @deprecated Superseded by CLAUDE_CODE_AUTO_COMPACT_WINDOW + CLAUDE_AUTOCOMPACT_PCT_OVERRIDE
 * (global auto-compact). Both variables must be set together — PCT alone has no effect on
 * a default local session (see code.claude.com/docs/en/env-vars). forge init writes
 * WINDOW=1000000 + PCT=60 for GLM-5.2 1M contexts (regenerative-checkpoint D9).
 * This script is retained for backward compatibility but the primary budget
 * management is now handled by Claude Code's built-in auto-compact mechanism.
 *
 * track-read-budget.mjs — PostToolUse hook for Read tool.
 *
 * Maintains a session-level cumulative Read budget in TMPDIR.
 * Warns when Read output exceeds thresholds to prevent context explosion.
 *
 * Usage (hooks.json PostToolUse, matcher: Read):
 *   node scripts/track-read-budget.mjs "$TOOL_INPUT_FILE"
 *
 * Fail-open: always exits 0, never blocks tool calls.
 *
 * Layer 5 of the five-layer context explosion defense.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WARN_THRESHOLD = 100 * 1024;  // 100 KB ≈ 25K tokens ≈ 60% context
const FORCE_THRESHOLD = 150 * 1024; // 150 KB ≈ 37K tokens ≈ 80% context

const sessionId = process.env.CLAUDE_SESSION_ID || String(process.pid);
const BUDGET_FILE = join(tmpdir(), `forge-read-budget-${sessionId}.json`);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  try {
    const inputFilePath = process.argv[2];
    if (!inputFilePath) return;

    // Read the tool result from the input file
    let resultContent = "";
    try {
      resultContent = await readFile(inputFilePath, "utf-8");
    } catch {
      // Input file not readable — nothing to track
      return;
    }

    // Estimate character count from the result
    const charCount = resultContent.length;
    if (charCount === 0) return;

    // Read existing budget
    let budget = { totalChars: 0, readCount: 0 };
    try {
      const existing = await readFile(BUDGET_FILE, "utf-8");
      budget = JSON.parse(existing);
    } catch {
      // First read or corrupted file — start fresh
    }

    // Update budget
    budget.totalChars += charCount;
    budget.readCount += 1;

    // Persist
    try {
      await mkdir(join(tmpdir()), { recursive: true });
      await writeFile(BUDGET_FILE, JSON.stringify(budget, null, 2));
    } catch {
      // Can't write budget file — warn but don't fail
    }

    // Check thresholds
    const totalKB = Math.round(budget.totalChars / 1024);
    if (budget.totalChars > FORCE_THRESHOLD) {
      console.error(`⛔ Read budget exceeded: ${totalKB}KB (${budget.readCount} reads). MUST /clear before continuing.`);
    } else if (budget.totalChars > WARN_THRESHOLD) {
      console.error(`⚠️ Read budget: ${totalKB}KB (${budget.readCount} reads). Consider /clear + /tinkerman resume.`);
    }
  } catch {
    // Fail-open: never block
  }
}

main();
