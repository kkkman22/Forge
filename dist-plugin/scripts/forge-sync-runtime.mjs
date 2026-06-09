#!/usr/bin/env node
// category: user-facing
/**
 * forge-sync-runtime.mjs — Check or repair Forge runtime hook shims.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const REQUIRED = ["SessionStart", "UserPromptSubmit", "Stop", "PreCompact", "PostCompact"];

function showHelp() {
  console.log(`Usage: node scripts/forge-sync-runtime.mjs [--mode auto|source|marketplace] [--repair] [--json]

Check or repair Forge-managed runtime hook shims in .claude/settings.json.

Options:
  --mode       Runtime mode. Defaults to auto (marketplace when CLAUDE_PLUGIN_ROOT is set, otherwise source).
  --repair     Add or update Forge-managed hook shims.
  --json       Print a JSON report.`);
}

function parseArgs(argv) {
  const args = { mode: "auto", repair: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--repair") args.repair = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--mode") args.mode = argv[++i] || "source";
  }
  return args;
}

function resolveMode(mode) {
  if (mode === "source" || mode === "marketplace") return mode;
  return process.env.CLAUDE_PLUGIN_ROOT ? "marketplace" : "source";
}

function settingsPath(root) {
  return join(root, ".claude", "settings.json");
}

function readSettings(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

function commandFor(mode, event) {
  const base =
    mode === "marketplace"
      ? "${CLAUDE_PLUGIN_ROOT}/scripts/forge-hook-dispatch.mjs"
      : "${CLAUDE_PROJECT_DIR}/scripts/forge-hook-dispatch.mjs";
  return `node ${base} ${event} # @forge-runtime:${event}`;
}

function detect(root, mode) {
  const path = settingsPath(root);
  const settings = readSettings(path);
  const hooks = settings.hooks || {};
  const missingHookEvents = [];
  const staleHookEvents = [];
  for (const event of REQUIRED) {
    const entries = Array.isArray(hooks[event]) ? hooks[event] : [];
    const serialized = JSON.stringify(entries);
    if (!serialized.includes(`@forge-runtime:${event}`)) missingHookEvents.push(event);
    else if (!serialized.includes(commandFor(mode, event))) staleHookEvents.push(event);
  }
  return {
    mode,
    drift: missingHookEvents.length > 0 || staleHookEvents.length > 0,
    missingHookEvents,
    staleHookEvents,
    settingsPath: path,
  };
}

function repair(root, mode) {
  const path = settingsPath(root);
  const settings = readSettings(path);
  settings.hooks ||= {};
  for (const event of REQUIRED) {
    const entries = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
    const preserved = entries.filter((entry) => !JSON.stringify(entry).includes(`@forge-runtime:${event}`));
    settings.hooks[event] = [
      ...preserved,
      { hooks: [{ type: "command", command: commandFor(mode, event), timeout: 5 }] },
    ];
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    return;
  }

  const args = parseArgs(process.argv.slice(2));
  const mode = resolveMode(args.mode);
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (args.repair) repair(root, mode);
  const report = detect(root, mode);

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } else if (report.drift) {
    process.stdout.write(
      `Forge runtime drift detected: missing=${report.missingHookEvents.join(",") || "none"} stale=${report.staleHookEvents.join(",") || "none"}\n`,
    );
  } else {
    process.stdout.write("Forge runtime hooks are in sync.\n");
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
