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
  // Scan ALL hook events for the unsupported args[] form — Forge v3.4.0–v3.6.0
  // wrote 15 such entries into user projects and a plugin upgrade alone cannot
  // repair them (init.sh skips hooks sync when a "hooks" key exists).
  const brokenArgsHooks = [];
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      const groupHooks =
        group && typeof group === "object" && Array.isArray(group.hooks) ? group.hooks : [];
      for (const hook of groupHooks) {
        if (hook && typeof hook === "object" && Array.isArray(hook.args) && hook.args.length > 0) {
          brokenArgsHooks.push({ event, command: hook.args.join(" ") });
        }
      }
    }
  }
  return {
    mode,
    drift:
      missingHookEvents.length > 0 || staleHookEvents.length > 0 || brokenArgsHooks.length > 0,
    missingHookEvents,
    staleHookEvents,
    brokenArgsHooks,
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
  } else if (report.brokenArgsHooks && report.brokenArgsHooks.length > 0) {
    // Migration warning for projects polluted by Forge v3.4.0–v3.6.0.
    // Upgrading the plugin alone does NOT repair these because init.sh skips
    // hooks sync when a "hooks" key already exists — they are snapshot copies.
    const events = [...new Set(report.brokenArgsHooks.map((h) => h.event))];
    process.stdout.write(
      `⚠️  Forge detected ${report.brokenArgsHooks.length} hook(s) in .claude/settings.json using the unsupported "args" form (events: ${events.join(", ")}).\n` +
        `   Claude Code /doctor rejects these ("type: Invalid input") and they never fire.\n` +
        `   This was a Forge bug fixed in v3.6.1. To repair your project:\n` +
        `     1. Delete the "hooks" key in .claude/settings.json\n` +
        `     2. Re-run: forge init\n` +
        `   (Upgrading the plugin alone is NOT enough — the broken entries are a snapshot copy.)\n`,
    );
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
