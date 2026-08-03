/**
 * P2 zcode-p2-native-architecture — runtime host detection + singleton.
 *
 * detectHost() probes runtime env signals to pick ClaudeAdapter vs
 * ZcodeAdapter. Fail-safe: when no ZCODE_* signal is present, returns
 * ClaudeAdapter (never silently degrade Claude-side behavior — inherited
 * from P1 R2 AC3).
 *
 * getHostAdapter() memoizes the instance for the process lifetime (probe cost
 * amortized to once, < 1ms). resetHostAdapter() is test-only.
 *
 * The ZCODE signal list is kept in sync with P1's scripts/lib/zcode-platform.mjs
 * `ZCODE_ENV_SIGNALS` so the TS HostAdapter and the mjs hook fallback agree.
 *
 * **Validates: requirements R3-AC1..AC7.**
 */

import { ClaudeAdapter } from "./claude-adapter.js";
import type { GovernanceOverride } from "./governance.js";
import type { HostAdapter, Platform } from "./types.js";
import { ZcodeAdapter } from "./zcode-adapter.js";

// ---------------------------------------------------------------------------
// Signal list — MUST match scripts/lib/zcode-platform.mjs ZCODE_ENV_SIGNALS
// ---------------------------------------------------------------------------

/**
 * ZCode-only environment signals (Claude Code does not inject these).
 * Any one present ⇒ Zcode runtime. Exported so the mjs fallback and tests can
 * assert parity.
 */
export const ZCODE_HOST_SIGNALS: readonly string[] = [
  "ZCODE_PLUGIN_ROOT",
  "ZCODE_PROJECT_DIR",
  "ZCODE_SESSION_ID",
  "ZCODE_PLUGIN_DATA",
];

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function isNonEmpty(v: string | undefined): boolean {
  return typeof v === "string" && v.length > 0;
}

/**
 * Detect the current host platform from runtime env signals.
 *
 * - Any ZCODE_* signal present ⇒ "zcode".
 * - Otherwise (incl. all-absent / ambiguous) ⇒ "claude-code" (fail-safe).
 */
export function detectPlatform(): Platform {
  const isZcode = ZCODE_HOST_SIGNALS.some((name) => isNonEmpty(process.env[name]));
  return isZcode ? "zcode" : "claude-code";
}

// ---------------------------------------------------------------------------
// Singleton injection
// ---------------------------------------------------------------------------

let _instance: HostAdapter | null = null;
let _override: GovernanceOverride = {};

/**
 * Configure the governance override applied to the next-created adapter.
 *
 * Call before the first getHostAdapter(); subsequent cached instances retain
 * the override that was active at creation time. Used to thread config.md /
 * userConfig values into capability-driven derivation.
 */
export function configureHostAdapter(override: GovernanceOverride): void {
  _override = override;
  // If an adapter already exists with stale overrides, force re-probe so the
  // new override takes effect.
  _instance = null;
}

/**
 * Get the process-wide HostAdapter singleton, creating it on first call.
 *
 * Fail-safe: probes once; if no ZCODE_* signal, returns a ClaudeAdapter.
 */
export function getHostAdapter(): HostAdapter {
  if (_instance) return _instance;
  _instance =
    detectPlatform() === "zcode" ? new ZcodeAdapter(_override) : new ClaudeAdapter(_override);
  return _instance;
}

/**
 * Reset the singleton (test-only). Forces the next getHostAdapter() to probe.
 */
export function resetHostAdapter(): void {
  _instance = null;
  _override = {};
}
