#!/usr/bin/env node
// category: user-facing
/**
 * forge-sync-runtime.mjs — Check or repair Forge runtime hook shims.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const REQUIRED = ["SessionStart", "UserPromptSubmit", "Stop", "PreCompact", "PostCompact"];

function showHelp() {
  console.log(`Usage: node scripts/tinkerman-sync-runtime.mjs [--mode auto|source|marketplace] [--repair] [--json]

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

/**
 * Build the source-mode Forge runtime hook command for an event. Marketplace
 * mode never reaches here: detect/repair short-circuit before calling this,
 * because the plugin's hooks/hooks.json is the sole hook source and
 * `${CLAUDE_PLUGIN_ROOT}` is rejected at project-settings scope.
 */
function commandFor(event) {
  return `node \${CLAUDE_PROJECT_DIR}/scripts/tinkerman-hook-dispatch.mjs ${event} # @forge-runtime:${event}`;
}

function detect(root, mode) {
  const path = settingsPath(root);
  const settings = readSettings(path);
  const hooks = settings.hooks || {};

  if (mode === "marketplace") {
    // Marketplace mode: the plugin's own hooks/hooks.json is the sole source
    // of runtime hooks, and Claude Code rejects ${CLAUDE_PLUGIN_ROOT} at
    // project scope. We never *expect* project settings.json to carry Forge
    // shims — but older Forge versions injected them, so leftover
    // @forge-runtime markers count as drift that repair() will clean up.
    const staleHookEvents = [];
    for (const event of REQUIRED) {
      const entries = Array.isArray(hooks[event]) ? hooks[event] : [];
      if (JSON.stringify(entries).includes(`@forge-runtime:${event}`)) {
        staleHookEvents.push(event);
      }
    }
    return {
      mode,
      drift: staleHookEvents.length > 0,
      missingHookEvents: [],
      staleHookEvents,
      settingsPath: path,
    };
  }

  const missingHookEvents = [];
  const staleHookEvents = [];
  for (const event of REQUIRED) {
    const entries = Array.isArray(hooks[event]) ? hooks[event] : [];
    const serialized = JSON.stringify(entries);
    if (!serialized.includes(`@forge-runtime:${event}`)) missingHookEvents.push(event);
    else if (!serialized.includes(commandFor(event))) staleHookEvents.push(event);
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
  const preDetect = detect(root, mode);

  // Marketplace mode: in the common case there are no legacy shims to clean,
  // so the file is left byte-for-byte untouched. Only when detect() reports
  // leftover @forge-runtime markers do we rewrite the file to strip them.
  if (mode === "marketplace") {
    if (!preDetect.drift) return;
    const settings = readSettings(path);
    settings.hooks ||= {};
    for (const event of REQUIRED) {
      const entries = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
      const preserved = entries.filter((entry) => !JSON.stringify(entry).includes(`@forge-runtime:${event}`));
      if (preserved.length > 0) {
        settings.hooks[event] = preserved;
      } else {
        delete settings.hooks[event];
      }
    }
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
    return;
  }

  const settings = readSettings(path);
  settings.hooks ||= {};
  for (const event of REQUIRED) {
    const entries = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
    const preserved = entries.filter((entry) => !JSON.stringify(entry).includes(`@forge-runtime:${event}`));
    settings.hooks[event] = [
      ...preserved,
      { hooks: [{ type: "command", command: commandFor(event), timeout: 5 }] },
    ];
  }
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
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
