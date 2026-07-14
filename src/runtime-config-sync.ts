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
function hookCommand(_mode: RuntimeConfigMode, event: RequiredHookEvent): string {
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
 * Marketplace mode: the plugin's own `hooks/hooks.json` is the sole source of
 * runtime hooks, and Claude Code rejects `${CLAUDE_PLUGIN_ROOT}` literals at
 * project-settings scope. We therefore never *expect* project settings.json to
 * carry Forge runtime shims in marketplace mode. But older Forge versions did
 * inject them, so we still report `drift: true` when legacy `@forge-runtime`
 * markers are present — `repairRuntimeConfig` uses this to clean them up.
 *
 * @public
 */
export function detectRuntimeConfigDrift(
  options: RuntimeConfigSyncOptions,
): RuntimeConfigDriftReport {
  const path = settingsPathFor(options);

  const settings = readSettings(path);
  const hooks = getHooks(settings);

  if (options.mode === "marketplace") {
    // In marketplace mode the only drift that matters is leftover legacy
    // shims (from older Forge versions) — they must be cleaned, never added.
    const staleHookEvents: string[] = [];
    for (const event of REQUIRED_HOOK_EVENTS) {
      const entries = Array.isArray(hooks[event]) ? hooks[event] : [];
      if (containsForgeMarker(entries, event)) {
        staleHookEvents.push(event);
      }
    }
    return {
      mode: "marketplace",
      drift: staleHookEvents.length > 0,
      missingHookEvents: [],
      staleHookEvents,
      settingsPath: path,
    };
  }

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
 * Marketplace mode: the plugin's `hooks/hooks.json` provides every runtime
 * hook, and writing `${CLAUDE_PLUGIN_ROOT}` shims into the project settings.json
 * is rejected by Claude Code. So we never *add* shims. But older Forge versions
 * did inject them (using a `${CLAUDE_PLUGIN_ROOT}` literal that Claude Code now
 * rejects at Stop/SessionStart). To self-heal upgraded installs, marketplace
 * mode strips any leftover `@forge-runtime` markers while leaving user-managed
 * hooks untouched.
 *
 * @public
 */
export function repairRuntimeConfig(options: RuntimeConfigSyncOptions): RuntimeConfigRepairResult {
  const before = detectRuntimeConfigDrift(options);
  const path = settingsPathFor(options);

  // Marketplace mode: in the common case there are no legacy shims to clean,
  // so the file should be left byte-for-byte untouched. Only when detect()
  // reports leftover @forge-runtime markers do we rewrite the file to strip
  // them. (getHooks() mutates settings by creating an empty hooks object,
  // so we must short-circuit before touching it to avoid spurious writes.)
  if (options.mode === "marketplace") {
    if (!before.drift) {
      return { ...before, changed: false };
    }
    const settings = readSettings(path);
    const hooks = getHooks(settings);
    for (const event of REQUIRED_HOOK_EVENTS) {
      const entries = Array.isArray(hooks[event]) ? hooks[event] : [];
      const preserved = removeMarkedEntries(entries, event);
      if (preserved.length > 0) {
        hooks[event] = preserved;
      } else {
        delete hooks[event];
      }
    }
    if (Object.keys(hooks).length === 0) {
      delete settings.hooks;
    }
    const next = `${JSON.stringify(settings, null, 2)}\n`;
    const previous = existsSync(path) ? readFileSync(path, "utf-8") : "";
    if (next !== previous) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, next);
    }
    const after = detectRuntimeConfigDrift(options);
    return { ...after, changed: true };
  }

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
