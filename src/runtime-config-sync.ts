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

function hookCommand(mode: RuntimeConfigMode, event: RequiredHookEvent): string {
  const projectDir = "$" + "{CLAUDE_PROJECT_DIR}";
  const pluginRoot = "$" + "{CLAUDE_PLUGIN_ROOT}";
  const dispatcher =
    mode === "source"
      ? `${projectDir}/scripts/forge-hook-dispatch.mjs`
      : `${pluginRoot}/scripts/forge-hook-dispatch.mjs`;
  return `node ${dispatcher} ${event} # @forge-runtime:${event}`;
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

/** Detect drift between Forge runtime hook shims and the requested runtime mode. @public */
export function detectRuntimeConfigDrift(
  options: RuntimeConfigSyncOptions,
): RuntimeConfigDriftReport {
  const path = settingsPathFor(options);
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

/** Repair Forge-managed runtime hook shims without deleting user-managed hooks. @public */
export function repairRuntimeConfig(options: RuntimeConfigSyncOptions): RuntimeConfigRepairResult {
  const before = detectRuntimeConfigDrift(options);
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
