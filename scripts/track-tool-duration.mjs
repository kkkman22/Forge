#!/usr/bin/env node

/**
 * track-tool-duration.mjs — PostToolUse hook for duration_ms extraction.
 *
 * Reads the tool result from the PostToolUse hook input, extracts timing
 * metadata, and appends a JSONL entry to `.tinkerman/runs/<date>-tool-durations.jsonl`.
 *
 * Usage (hooks.json PostToolUse):
 *   node scripts/track-tool-duration.mjs "$TOOL_INPUT_FILE"
 *
 * Fail-open: always exits 0, never blocks tool calls.
 *
 * Relates to: §74 OTEL duration_ms tracking
 */

import { readFile, mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ROOT = process.cwd();
const RUNS_DIR = join(PROJECT_ROOT, ".tinkerman", "runs");
const STATUS_FILE = join(PROJECT_ROOT, ".tinkerman", "status.md");

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

/**
 * Parse OTEL_RESOURCE_ATTRIBUTES (W3C Baggage-style "k=v,k=v") into an object,
 * so local duration metrics can be sliced by custom dimensions (e.g. forge.tier,
 * forge.phase, forge.command) — mirrors Claude Code 2.1.161 attaching these
 * values as labels on metric datapoints. Returns null when unset/empty.
 * Fail-open: malformed pairs are skipped.
 */
function parseResourceAttributes() {
  const raw = process.env.OTEL_RESOURCE_ATTRIBUTES;
  if (!raw) return null;
  const out = {};
  for (const pair of raw.split(",")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Read Forge phase/tier/task from `.tinkerman/status.md` frontmatter so duration
 * metrics can be sliced by Forge dimensions in `/tinkerman learn`. A PostToolUse
 * hook cannot mutate the parent session env, so we read the live status file
 * here instead of relying on env injection at phase/tier transitions.
 * Returns {} when the file is absent or unreadable (fail-open).
 */
function readForgeContext() {
  try {
    const raw = readFileSync(STATUS_FILE, "utf-8");
    const fm = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) return {};
    const grab = (key) => {
      const m = fm[1].match(new RegExp(`^${key}:\\s*"?([^"\\n]+?)"?\\s*$`, "m"));
      return m ? m[1].trim() : null;
    };
    const out = {};
    const phase = grab("phase");
    const tier = grab("tier");
    const task = grab("current_task");
    if (phase) out["forge.phase"] = phase;
    if (tier) out["forge.tier"] = tier;
    if (task) out["forge.task"] = task;
    return out;
  } catch {
    return {};
  }
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

    // Extract tool name (truncate to prevent log bloat)
    const rawToolName = toolInput.tool_name || toolInput.tool || "unknown";
    const toolName = rawToolName.length > 64 ? rawToolName.slice(0, 64) : rawToolName;

    // Extract duration
    const durationMs = extractDuration(toolInput);

    // Extract session ID
    const sessionId = process.env.CLAUDE_SESSION_ID || "unknown";

    // Resource attributes: .tinkerman/status.md (phase/tier/task) merged with
    // OTEL_RESOURCE_ATTRIBUTES env (env wins on conflict).
    const envAttrs = parseResourceAttributes() || {};
    const merged = { ...readForgeContext(), ...envAttrs };
    const resourceAttributes = Object.keys(merged).length > 0 ? merged : null;

    // Build JSONL entry
    const entry = {
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      tool_name: toolName,
      duration_ms: durationMs,
      agent_id: toolInput.agent_id || null,
      parent_agent_id: toolInput.parent_agent_id || null,
      resource_attributes: resourceAttributes,
    };

    // Ensure .tinkerman/runs/ exists
    if (!existsSync(RUNS_DIR)) {
      await mkdir(RUNS_DIR, { recursive: true });
    }

    // Append to date-stamped JSONL file
    const dateStamp = getDateStamp();
    const logFile = join(RUNS_DIR, `${dateStamp}-tool-durations.jsonl`);
    const line = JSON.stringify(entry) + "\n";

    await appendFile(logFile, line);
  } catch (err) {
    // Fail-open: never block, but log for diagnosability
    process.stderr.write(`[track-tool-duration] ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

main();
