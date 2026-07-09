#!/usr/bin/env node
/**
 * zcode-platform.mjs — Shared platform detection + hook output pruning.
 *
 * Detects whether the current hook runtime is ZCode (vs Claude Code) by probing
 * runtime environment signals, and prunes non-whitelisted keys from hook stdout
 * output so ZCode's strict JSON schema does not emit validation warnings — while
 * leaving Claude Code output byte-for-byte unchanged.
 *
 * Detection signal: ZCode injects `ZCODE_*` env vars into plugin hooks
 * (zcode-guide diagnosing-hooks §2). Claude Code does not inject these.
 * Fail-safe: if no `ZCODE_*` signal is present, treat as Claude Code and emit
 * the full output (never silently degrade Claude-side behavior).
 *
 * @see https://code.claude.com/docs/en/hooks
 * category: internal-only
 */

/**
 * ZCode-only environment signals (Claude Code does not inject these).
 * Any one present ⇒ ZCode runtime.
 */
const ZCODE_ENV_SIGNALS = [
  "ZCODE_PLUGIN_ROOT",
  "ZCODE_PROJECT_DIR",
  "ZCODE_SESSION_ID",
  "ZCODE_PLUGIN_DATA",
];

/**
 * ZCode strict-schema whitelist, keyed by hook event.
 * Keys absent from the relevant set are pruned on ZCode.
 *
 * `additionalContext` is universally whitelisted across events.
 * Source: zcode-guide diagnosing-hooks §2 (Hook output) + pitfall #8.
 */
const ZCODE_WHITELIST_BY_EVENT = {
  // Universal — present in every event's whitelist.
  _universal: ["additionalContext"],
  SessionStart: [],
  UserPromptSubmit: [],
  PreToolUse: ["decision", "systemMessage"],
  PermissionRequest: ["decision", "systemMessage"],
  PostToolUse: ["updatedToolOutput"],
  PostToolUseFailure: ["updatedToolOutput"],
  Stop: ["stopHookActive", "stopReason"],
};

/**
 * Detect whether the current process is running under ZCode.
 *
 * Reads `ZCODE_*` env vars; any one present ⇒ ZCode.
 * Fail-safe: returns false when no signal is present (treat as Claude Code).
 *
 * @returns {boolean}
 */
export function isZCodeRuntime() {
  return ZCODE_ENV_SIGNALS.some((name) => {
    const v = process.env[name];
    return typeof v === "string" && v.length > 0;
  });
}

/**
 * Build the whitelist of top-level keys allowed for a given hook event on ZCode.
 * Combines the universal set with the event-specific set.
 *
 * @param {string} [eventName] — hook event name (e.g. "SessionStart", "PreToolUse").
 * @returns {string[]} top-level keys ZCode will accept.
 */
export function zcodeWhitelist(eventName) {
  const extra = ZCODE_WHITELIST_BY_EVENT[eventName] || [];
  return [...ZCODE_WHITELIST_BY_EVENT._universal, ...extra];
}

/**
 * Prune a hook output object for the current platform.
 *
 * - On Claude Code (no ZCode signal): returns the object unchanged (byte-equal).
 * - On ZCode: returns a shallow copy retaining only whitelisted top-level keys.
 *
 * `hookSpecificOutput` is a non-whitelisted top-level key on ZCode (ZCode does
 * not recognize `reloadSkills` / `sessionTitle` / `updatedDisplay` / `hookEventName`).
 * It is dropped on ZCode; preserved on Claude Code.
 *
 * @param {Record<string, unknown>} output — the hook output object.
 * @param {string} [eventName] — hook event name, for event-specific whitelist.
 * @returns {Record<string, unknown>} pruned (ZCode) or unchanged (Claude Code).
 */
export function pruneHookOutput(output, eventName) {
  if (!isZCodeRuntime()) {
    return output;
  }
  const allow = new Set(zcodeWhitelist(eventName));
  const pruned = {};
  for (const key of Object.keys(output)) {
    if (allow.has(key)) {
      pruned[key] = output[key];
    }
  }
  return pruned;
}
