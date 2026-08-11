#!/usr/bin/env node
// category: internal-only
/**
 * forge-hook-dispatch.mjs — Stable Forge runtime hook shim.
 *
 * Source mode and marketplace mode both point Claude Code hook entries here.
 * The shim stays intentionally small: it emits bounded additional context and
 * delegates phase-specific behavior to normal Forge scripts where needed.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function showHelp() {
  console.log(`Usage: node scripts/tinkerman-hook-dispatch.mjs <event>

Internal Forge hook shim. Normally invoked by Claude Code hooks, not by users.

Events:
  SessionStart
  UserPromptSubmit
  Stop
  PreCompact
  PostCompact`);
}

function projectRoot() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function statusLine(root) {
  const statusPath = join(root, ".tinkerman", "status.md");
  if (!existsSync(statusPath)) return "Forge runtime active; no status.md found.";
  const content = readFileSync(statusPath, "utf-8");
  const phase = content.match(/^phase:\s*"?([^"\n]+)"?/m)?.[1] ?? "unknown";
  const currentPackage = content.match(/^current_package:\s*"?([^"\n]+)"?/m)?.[1];
  return currentPackage
    ? `Forge runtime active: phase=${phase}, current_package=${currentPackage}.`
    : `Forge runtime active: phase=${phase}.`;
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    return;
  }

  const event = process.argv[2] || "unknown";
  const root = projectRoot();

  if (event === "PreCompact" || event === "PostCompact" || event === "SessionStart") {
    process.stdout.write(JSON.stringify({ additionalContext: statusLine(root) }));
  }
}

main().catch(() => process.exit(0));
