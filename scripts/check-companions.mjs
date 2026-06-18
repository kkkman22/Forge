#!/usr/bin/env node

/**
 * check-companions.mjs — Detect companion tool availability.
 *
 * Checks which token optimization companion tools are installed and outputs
 * a structured report. Used by SessionStart hook to inject tool-availability
 * context into the agent's awareness.
 *
 * Currently detects:
 *   - code-review-graph (CRG) — code knowledge graph
 *   - headroom — API-level prompt compression
 *   - context-mode — large output sandbox
 *
 * Fail-open: always exits 0, missing tools reported as "not available".
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const COMPANIONS = [
  {
    name: "code-review-graph",
    detectCommand: ["code-review-graph", ["status"]],
    label: "CRG",
    description: "Code knowledge graph (AST-level queries)",
  },
  {
    name: "headroom",
    detectCommand: ["headroom", ["--version"]],
    label: "Headroom",
    description: "API-level prompt compression proxy",
  },
  {
    name: "context-mode",
    detectCommand: ["context-mode", ["--version"]],
    label: "context-mode",
    description: "Large output sandbox with BM25 index",
  },
];

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Check if a tool is available by running its detection command.
 * Timeout: 3 seconds per tool.
 *
 * @param {string} executable - Command name to run (e.g. "headroom")
 * @param {string[]} args - Arguments for the detection command
 * @returns {Promise<boolean>} true if tool responded successfully
 */
async function isAvailable(executable, args) {
  try {
    await execFileAsync(executable, args, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Detect all companions concurrently (not sequential) — 3s max vs 12s worst case
  const availability = await Promise.allSettled(
    COMPANIONS.map((tool) => isAvailable(tool.detectCommand[0], tool.detectCommand[1])),
  );

  const results = COMPANIONS.map((tool, i) => ({
    name: tool.name,
    label: tool.label,
    available: availability[i].status === "fulfilled" && availability[i].value === true,
    description: tool.description,
  }));

  // Output as structured text for SessionStart injection
  const lines = results.map((r) =>
    `${r.label}: ${r.available ? "available" : "not available"} — ${r.description}`,
  );

  console.log("## Companion Tools Status");
  console.log(lines.join("\n"));

  // Also output CRG-specific guidance if available
  const crg = results.find((r) => r.name === "code-review-graph");
  if (crg?.available) {
    console.log("\n## CRG Usage Guide");
    console.log("- Use query_graph_tool for code structure queries (~100 tokens)");
    console.log("- Use get_impact_radius_tool for ripple/blast-radius analysis");
    console.log("- Use get_minimal_context_tool for focused code context");
    console.log("- Fallback: existing Think in Code batch scripts if CRG fails");
  }
}

main();
