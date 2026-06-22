import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type RuntimeConfigMode = "source" | "marketplace";

export interface RuntimeConfigSyncOptions {
  projectRoot: string;
  mode: RuntimeConfigMode;
  settingsPath?: string;
}

export interface RuntimeConfigDriftReport {
  mode: RuntimeConfigMode;
  drift: boolean;
  missingHookEvents: string[];
  staleHookEvents: string[];
  settingsPath: string;
}

export interface RuntimeConfigRepairResult extends RuntimeConfigDriftReport {
  changed: boolean;
}

const REQUIRED_HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "Stop",
  "PreCompact",
  "PostCompact",
] as const;

type RequiredHookEvent = (typeof REQUIRED_HOOK_EVENTS)[number];

function settingsPathFor(options: RuntimeConfigSyncOptions): string {
  return options.settingsPath ?? join(options.projectRoot, ".claude", "settings.json");
}

function readSettings(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
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
function hookCommand(mode: RuntimeConfigMode, event: RequiredHookEvent): string {
  const projectDir = "$" + "{CLAUDE_PROJECT_DIR}";
  return `node ${projectDir}/scripts/forge-hook-dispatch.mjs ${event} # @forge-runtime:${event}`;
}

function getHooks(settings: Record<string, unknown>): Record<string, unknown[]> {
  if (typeof settings.hooks !== "object" || settings.hooks === null) {
    settings.hooks = {};
  }
  return settings.hooks as Record<string, unknown[]>;
}

function containsExpectedForgeHook(
  entries: unknown[],
  mode: RuntimeConfigMode,
  event: RequiredHookEvent,
): boolean {
  const expected = hookCommand(mode, event);
  return entries.some((entry) => JSON.stringify(entry).includes(expected));
}

function containsForgeMarker(entries: unknown[], event: RequiredHookEvent): boolean {
  return entries.some((entry) => JSON.stringify(entry).includes(`@forge-runtime:${event}`));
}

/**
 * Detect drift between Forge runtime hook shims and the requested runtime mode.
 *
 * Marketplace mode is a no-op for drift purposes: the plugin's own
 * `hooks/hooks.json` is the sole source of runtime hooks, and Claude Code
 * rejects `${CLAUDE_PLUGIN_ROOT}` literals at project-settings scope. We
 * therefore never expect project settings.json to carry Forge runtime shims
 * in marketplace mode, and report `drift: false` unconditionally.
 *
 * @public
 */
export function detectRuntimeConfigDrift(
  options: RuntimeConfigSyncOptions,
): RuntimeConfigDriftReport {
  const path = settingsPathFor(options);

  if (options.mode === "marketplace") {
    return {
      mode: "marketplace",
      drift: false,
      missingHookEvents: [],
      staleHookEvents: [],
      settingsPath: path,
    };
  }

  const settings = readSettings(path);
  const hooks = getHooks(settings);
  const missingHookEvents: string[] = [];
  const staleHookEvents: string[] = [];

  for (const event of REQUIRED_HOOK_EVENTS) {
    const entries = Array.isArray(hooks[event]) ? hooks[event] : [];
    if (!containsForgeMarker(entries, event)) {
      missingHookEvents.push(event);
      continue;
    }
    if (!containsExpectedForgeHook(entries, options.mode, event)) {
      staleHookEvents.push(event);
    }
  }

  return {
    mode: options.mode,
    drift: missingHookEvents.length > 0 || staleHookEvents.length > 0,
    missingHookEvents,
    staleHookEvents,
    settingsPath: path,
  };
}

function forgeHookEntry(
  mode: RuntimeConfigMode,
  event: RequiredHookEvent,
): Record<string, unknown> {
  return {
    hooks: [
      {
        type: "command",
        command: hookCommand(mode, event),
        timeout: 5,
      },
    ],
  };
}

function removeMarkedEntries(entries: unknown[], event: RequiredHookEvent): unknown[] {
  return entries.filter((entry) => !JSON.stringify(entry).includes(`@forge-runtime:${event}`));
}

/**
 * Repair Forge-managed runtime hook shims without deleting user-managed hooks.
 *
 * Marketplace mode short-circuits to a no-op: the plugin's `hooks/hooks.json`
 * provides every runtime hook, and writing `${CLAUDE_PLUGIN_ROOT}` shims into
 * the project settings.json is rejected by Claude Code. Project settings is
 * left untouched.
 *
 * @public
 */
export function repairRuntimeConfig(options: RuntimeConfigSyncOptions): RuntimeConfigRepairResult {
  const before = detectRuntimeConfigDrift(options);
  if (options.mode === "marketplace") {
    return { ...before, changed: false };
  }

  const path = settingsPathFor(options);
  const settings = readSettings(path);
  const hooks = getHooks(settings);

  for (const event of REQUIRED_HOOK_EVENTS) {
    const entries = Array.isArray(hooks[event]) ? hooks[event] : [];
    const preserved = removeMarkedEntries(entries, event);
    hooks[event] = [...preserved, forgeHookEntry(options.mode, event)];
  }

  const next = `${JSON.stringify(settings, null, 2)}\n`;
  const previous = existsSync(path) ? readFileSync(path, "utf-8") : "";
  const changed = previous !== next;
  if (changed) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, next);
  }

  const after = detectRuntimeConfigDrift(options);
  return {
    ...after,
    changed: before.drift || changed,
  };
}
