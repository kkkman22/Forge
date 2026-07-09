#!/usr/bin/env node
// category: internal-only
/**
 * Stop/SubagentStop additionalContext feedback hook.
 *
 * Reads hook stdin, examines Forge state, and outputs structured
 * additionalContext JSON for Claude to continue processing.
 *
 * Falls back to silent exit 0 when no context is needed or when
 * Claude Code version doesn't support additionalContext.
 *
 * **Validates: Requirements 2.1–2.8**
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pruneHookOutput } from "./lib/zcode-platform.mjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum length for additionalContext string (bytes). */
export const MAX_ADDITIONAL_CONTEXT_LENGTH = 4096;

// ---------------------------------------------------------------------------
// Types (exported for testability)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} StopContextInput
 * @property {string} cwd
 * @property {string} [session_id]
 * @property {"Stop"|"SubagentStop"|"StopFailure"} hook_event_name
 * @property {string} [agent_id]
 * @property {string} [agent_type]
 */

/**
 * @typedef {Object} ForgeStateSnapshot
 * @property {string|null} phase
 * @property {string|null} task
 * @property {boolean} hasVerificationEvidence
 * @property {string[]} incompleteTasks
 * @property {boolean} isAutoAdvanceGap
 * @property {{ agentType: string, category: string, summary: string }|null} subagentFailure
 */

/**
 * @typedef {Object} StopContextDecision
 * @property {boolean} shouldEmit
 * @property {"missing_verification"|"incomplete_tasks"|"auto_advance_gap"|"subagent_failure"|"none"} reason
 * @property {string} [additionalContext]
 */

// ---------------------------------------------------------------------------
// Pure decision function — exported for testing
// ---------------------------------------------------------------------------

/**
 * Determine whether to emit additionalContext based on current Forge state.
 *
 * @param {import('./stop-additional-context.mjs').StopContextInput} input
 * @param {import('./stop-additional-context.mjs').ForgeStateSnapshot} state
 * @returns {import('./stop-additional-context.mjs').StopContextDecision}
 */
export function buildStopContext(input, state) {
  // Priority 1: Subagent failure (StopFailure is the proxy event for SubagentStop)
  if ((input.hook_event_name === "SubagentStop" || input.hook_event_name === "StopFailure") && state.subagentFailure) {
    const ctx = `Forge subagent (${state.subagentFailure.agentType}) failed: ${state.subagentFailure.category} — ${state.subagentFailure.summary}. Consider retry or check fallback ladder entry point.`;
    return {
      shouldEmit: true,
      reason: "subagent_failure",
      additionalContext: truncateContext(ctx),
    };
  }

  // No active phase → nothing to report
  if (!state.phase) {
    return { shouldEmit: false, reason: "none" };
  }

  // Priority 2: Missing verification evidence
  if (state.phase && !state.hasVerificationEvidence) {
    const cmd = "npm run check";
    const ctx = `Forge phase=${state.phase} is active. Verification evidence is missing. Run ${cmd} before claiming completion, then continue to next phase.`;
    return {
      shouldEmit: true,
      reason: "missing_verification",
      additionalContext: truncateContext(ctx),
    };
  }

  // Priority 3: Auto-advance gap (no-idle iron law)
  if (state.isAutoAdvanceGap) {
    const ctx = `Forge phase=${state.phase} appears complete but auto-advance to next phase has not triggered. Forge no-idle 铁律 requires immediate phase transition. Continue to the next phase now.`;
    return {
      shouldEmit: true,
      reason: "auto_advance_gap",
      additionalContext: truncateContext(ctx),
    };
  }

  // Priority 4: Incomplete tasks
  if (state.incompleteTasks.length > 0) {
    const taskList = state.incompleteTasks.slice(0, 10).join(", ");
    const suffix = state.incompleteTasks.length > 10 ? ` (+${state.incompleteTasks.length - 10} more)` : "";
    const ctx = `Forge has ${state.incompleteTasks.length} incomplete task(s): ${taskList}${suffix}. Continue current task or run /forge resume to restore context.`;
    return {
      shouldEmit: true,
      reason: "incomplete_tasks",
      additionalContext: truncateContext(ctx),
    };
  }

  return { shouldEmit: false, reason: "none" };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Truncate context to fit within MAX_ADDITIONAL_CONTEXT_LENGTH. */
function truncateContext(text) {
  if (text.length <= MAX_ADDITIONAL_CONTEXT_LENGTH) return text;
  // Preserve start and key paths
  const headRoom = MAX_ADDITIONAL_CONTEXT_LENGTH - 20;
  return text.slice(0, headRoom) + "... [truncated]";
}

/**
 * Read Forge state from .forge/ directory.
 */
function readForgeState(cwd) {
  const statusPath = join(cwd, ".forge", "status.md");
  const progressDir = join(cwd, ".forge", "progress");

  let phase = null;
  let task = null;

  // Parse status.md for current phase
  if (existsSync(statusPath)) {
    try {
      const content = readFileSync(statusPath, "utf-8");
      const phaseMatch = content.match(/^phase:\s*"?([^"\n]+)"?/m);
      if (phaseMatch) phase = phaseMatch[1].trim();
      const taskMatch = content.match(/^current_task:\s*"?([^"\n]+)"?/m);
      if (taskMatch) task = taskMatch[1].trim();
    } catch {
      // Silently ignore parse errors
    }
  }

  // Check for incomplete tasks in progress/
  const incompleteTasks = [];
  if (existsSync(progressDir)) {
    try {
      const files = readdirSync(progressDir).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        try {
          const content = readFileSync(join(progressDir, file), "utf-8");
          const unchecked = content.match(/^- \[ \].*/gm);
          if (unchecked) {
            for (const line of unchecked) {
              const taskMatch = line.match(/^- \[ \] (T?\d+[.:].*|\S+)/);
              if (taskMatch) incompleteTasks.push(taskMatch[1]);
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    } catch {
      // Progress dir unreadable
    }
  }

  // Check verification evidence: last commit message or recent test run
  const hasVerificationEvidence = checkVerificationEvidence(cwd);

  // Auto-advance gap detection: phase is build/review/test/ship and tasks recently completed
  const isAutoAdvanceGap = checkAutoAdvanceGap(phase, incompleteTasks);

  return {
    phase,
    task,
    hasVerificationEvidence,
    incompleteTasks,
    isAutoAdvanceGap,
    subagentFailure: null, // Only set from hook stdin for SubagentStop
  };
}

/**
 * Check if there's evidence of recent verification (test run, lint, etc.).
 * Heuristic: check if .forge/progress/ has recently-modified task files,
 * or if recent git commits contain test/verify patterns.
 */
function checkVerificationEvidence(cwd) {
  try {
    const { execSync } = require("node:child_process");
    // Check last 3 commits for test/verify evidence
    const log = execSync(
      'git log --oneline -3 --format="%s" 2>/dev/null',
      { cwd, encoding: "utf-8", timeout: 3000 },
    );
    const testPatterns = /\btest\b|\bverify\b|\bcheck\b|\bvitest\b|\bnpm run\b|\bci\b/i;
    if (testPatterns.test(log)) return true;

    // Check if any progress file was modified in the last 5 minutes
    const { readdirSync, statSync } = require("node:fs");
    const { join } = require("node:path");
    const progressDir = join(cwd, ".forge", "progress");
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    try {
      for (const f of readdirSync(progressDir)) {
        if (f.endsWith(".md")) {
          const st = statSync(join(progressDir, f));
          if (st.mtimeMs > fiveMinAgo) return true;
        }
      }
    } catch { /* progress dir not found, skip */ }

    return false;
  } catch {
    // Cannot determine — assume no evidence (safe: triggers diagnostic)
    return false;
  }
}

/**
 * Check if an auto-advance gap exists (phase should have moved but didn't).
 */
function checkAutoAdvanceGap(phase, incompleteTasks) {
  // If phase is active but all progress tasks are done, gap exists
  if (!phase || phase === "completed" || phase === "idle") return false;
  // Simple heuristic: if phase is active and no incomplete tasks in progress,
  // there might be a gap
  return incompleteTasks.length === 0 && ["build", "review", "test", "ship"].includes(phase);
}

// ---------------------------------------------------------------------------
// Main entry point (when run as hook)
// ---------------------------------------------------------------------------

async function main() {
  try {
    // Read hook stdin
    let hookInput = "";
    if (process.stdin.isTTY) {
      // Not connected to stdin, skip
      process.exit(0);
    }

    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    hookInput = Buffer.concat(chunks).toString("utf-8");

    if (!hookInput.trim()) {
      process.exit(0);
    }

    let parsed;
    try {
      parsed = JSON.parse(hookInput);
    } catch {
      process.exit(0);
    }

    const input = {
      cwd: parsed.cwd || process.cwd(),
      session_id: parsed.session_id,
      hook_event_name: parsed.hook_event_name || "Stop",
      agent_id: parsed.agent_id,
      agent_type: parsed.agent_type,
    };

    const state = readForgeState(input.cwd);

    // For SubagentStop, check for failure info
    if (input.hook_event_name === "SubagentStop") {
      if (parsed.agent_result === "error" || parsed.exit_reason === "error") {
        state.subagentFailure = {
          agentType: input.agent_type || "unknown",
          category: parsed.exit_reason || "error",
          summary: parsed.agent_result_detail || "Subagent exited with error",
        };
      }
    }

    const decision = buildStopContext(input, state);

    if (decision.shouldEmit && decision.additionalContext) {
      // Emit additionalContext at top level (ZCode whitelist) AND inside
      // hookSpecificOutput (Claude Code reads it there). pruneHookOutput drops
      // hookSpecificOutput on ZCode (non-whitelisted), keeping top-level
      // additionalContext; on Claude it returns the object unchanged so the
      // hookSpecificOutput shape is preserved.
      const output = pruneHookOutput(
        {
          additionalContext: decision.additionalContext,
          hookSpecificOutput: {
            additionalContext: decision.additionalContext,
          },
        },
        "Stop",
      );
      process.stdout.write(JSON.stringify(output) + "\n");
    }

    process.exit(0);
  } catch {
    // Never break the hook flow
    process.exit(0);
  }
}

// Run main when executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
