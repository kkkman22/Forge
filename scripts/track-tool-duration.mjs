#!/usr/bin/env node

/**
 * track-tool-duration.mjs — PostToolUse hook for duration_ms extraction.
 *
 * Reads the tool result from the PostToolUse hook input, extracts timing
 * metadata, and appends a JSONL entry to `.forge/runs/<date>-tool-durations.jsonl`.
 *
 * Usage (hooks.json PostToolUse):
 *   node scripts/track-tool-duration.mjs "$TOOL_INPUT_FILE"
 *
 * Fail-open: always exits 0, never blocks tool calls.
 *
 * Relates to: §74 OTEL duration_ms tracking
 */

import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ROOT = process.cwd();
const RUNS_DIR = join(PROJECT_ROOT, ".forge", "runs");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDateStamp() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Attempt to extract duration_ms from tool result content.
 * Claude Code may include timing info in the result metadata.
 */
function extractDuration(toolInput) {
  // Check for explicit duration_ms field
  if (typeof toolInput.duration_ms === "number") {
    return toolInput.duration_ms;
  }

  // Check nested result object
  if (toolInput.result && typeof toolInput.result.duration_ms === "number") {
    return toolInput.result.duration_ms;
  }

  // Check metadata
  if (toolInput.metadata && typeof toolInput.metadata.duration_ms === "number") {
    return toolInput.metadata.duration_ms;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  try {
    const inputFilePath = process.argv[2];
    if (!inputFilePath) return;

    // Read tool result
    let rawContent;
    try {
      rawContent = await readFile(inputFilePath, "utf-8");
    } catch {
      return;
    }

    // Parse JSON — PostToolUse input may be the tool call or result
    let toolInput;
    try {
      toolInput = JSON.parse(rawContent);
    } catch {
      // Not JSON — nothing to extract
      return;
    }

    // Extract tool name
    const toolName = toolInput.tool_name || toolInput.tool || "unknown";

    // Extract duration
    const durationMs = extractDuration(toolInput);
    if (durationMs === null) {
      // No timing data — still log the invocation for frequency tracking
    }

    // Extract session ID
    const sessionId = process.env.CLAUDE_SESSION_ID || "unknown";

    // Build JSONL entry
    const entry = {
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      tool_name: toolName,
      duration_ms: durationMs,
      agent_id: toolInput.agent_id || null,
      parent_agent_id: toolInput.parent_agent_id || null,
    };

    // Ensure .forge/runs/ exists
    if (!existsSync(RUNS_DIR)) {
      await mkdir(RUNS_DIR, { recursive: true });
    }

    // Append to date-stamped JSONL file
    const dateStamp = getDateStamp();
    const logFile = join(RUNS_DIR, `${dateStamp}-tool-durations.jsonl`);
    const line = JSON.stringify(entry) + "\n";

    await appendFile(logFile, line);
  } catch {
    // Fail-open: never block
  }
}

main();
