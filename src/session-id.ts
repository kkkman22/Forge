/**
 * Session ID resolver — unified session namespace for hook/Bash/MCP.
 *
 * Provides a priority-based session id resolver and scoped key generator
 * for use in locks, caches, and diagnostics across Forge subsystems.
 *
 * Priority chain: hook stdin session_id → CLAUDE_CODE_SESSION_ID →
 * CLAUDE_SESSION_ID → pid-fallback.
 *
 * **Validates: Requirements 4.1, 4.2, 4.5, 4.6**
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Sources of session id from different subsystems. */
export interface SessionIdSources {
  /** Session id from hook stdin JSON. */
  hookSessionId?: string;
  /** CLAUDE_CODE_SESSION_ID environment variable. */
  envClaudeCodeSessionId?: string;
  /** Legacy CLAUDE_SESSION_ID environment variable. */
  envLegacyClaudeSessionId?: string;
  /** Current process PID (used as fallback). */
  processPid: number;
}

/** Source that was selected for the resolved session id. */
export type SessionIdSource =
  | "hook"
  | "CLAUDE_CODE_SESSION_ID"
  | "CLAUDE_SESSION_ID"
  | "pid-fallback";

/** Result of resolving session id from multiple sources. */
export interface ResolvedSessionId {
  /** The resolved session id value (always non-empty). */
  value: string;
  /** Which source provided the value. */
  source: SessionIdSource;
  /** Whether all available sources agree on the same id. */
  consistent: boolean;
  /** List of mismatches if not consistent. */
  mismatch?: string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve session id from multiple sources using priority chain.
 *
 * Priority: hook stdin → CLAUDE_CODE_SESSION_ID → CLAUDE_SESSION_ID → pid fallback.
 * Also checks consistency across all available sources.
 *
 * @param sources - The available session id sources.
 * @returns A resolved session id with source and consistency info.
 */
export function resolveSessionId(sources: SessionIdSources): ResolvedSessionId {
  // Determine primary value by priority
  let value: string;
  let source: SessionIdSource;

  if (sources.hookSessionId && sources.hookSessionId.length > 0) {
    value = sources.hookSessionId;
    source = "hook";
  } else if (sources.envClaudeCodeSessionId && sources.envClaudeCodeSessionId.length > 0) {
    value = sources.envClaudeCodeSessionId;
    source = "CLAUDE_CODE_SESSION_ID";
  } else if (sources.envLegacyClaudeSessionId && sources.envLegacyClaudeSessionId.length > 0) {
    value = sources.envLegacyClaudeSessionId;
    source = "CLAUDE_SESSION_ID";
  } else {
    value = `pid-${sources.processPid}`;
    source = "pid-fallback";
  }

  // Check consistency: all present non-pid sources should agree
  const presentIds: Array<{ value: string; source: string }> = [];
  if (sources.hookSessionId && sources.hookSessionId.length > 0) {
    presentIds.push({ value: sources.hookSessionId, source: "hook" });
  }
  if (sources.envClaudeCodeSessionId && sources.envClaudeCodeSessionId.length > 0) {
    presentIds.push({ value: sources.envClaudeCodeSessionId, source: "CLAUDE_CODE_SESSION_ID" });
  }
  if (sources.envLegacyClaudeSessionId && sources.envLegacyClaudeSessionId.length > 0) {
    presentIds.push({ value: sources.envLegacyClaudeSessionId, source: "CLAUDE_SESSION_ID" });
  }

  if (presentIds.length <= 1) {
    return { value, source, consistent: true };
  }

  const mismatch: string[] = [];
  const firstValue = presentIds[0].value;
  for (let i = 1; i < presentIds.length; i++) {
    if (presentIds[i].value !== firstValue) {
      mismatch.push(
        `${presentIds[i].source}="${presentIds[i].value}" differs from ${presentIds[0].source}="${firstValue}"`,
      );
    }
  }

  return {
    value,
    source,
    consistent: mismatch.length === 0,
    mismatch: mismatch.length > 0 ? mismatch : undefined,
  };
}

/**
 * Generate a session-scoped key for use in locks, caches, etc.
 *
 * @param prefix - Key prefix (e.g., "lock", "cache").
 * @param session - The resolved session id.
 * @returns A string in the format `${prefix}-${session.value}`.
 */
export function sessionScopedKey(prefix: string, session: ResolvedSessionId): string {
  return `${prefix}-${session.value}`;
}
