/**
 * P2 zcode-p2-native-architecture — Zcode + GLM-5.2 HostAdapter implementation.
 *
 * Reads ZCODE_* env vars for paths/session (falling back to the CLAUDE_* vars
 * Zcode compat-injects), exposes the 7-event hook subset (no PreCompact /
 * SubagentStop), global-only subagent tier, and GLM-5.2 capabilities
 * (1M / Long Horizon). Governance is derived capability-driven.
 *
 * No Claude semver gate is applied on the Zcode host.
 *
 * **Validates: requirements R1-AC2, R1-AC5, R1-AC7 (Zcode).**
 */

import { resolveSessionId } from "../session-id";
import { GLM52_CAPABILITIES, type GovernancePolicy, type ModelCapabilities } from "./capabilities";
import { deriveGovernance, type GovernanceOverride } from "./governance";
import type { HookEvent, HostAdapter, HostPaths, HostVersion, SubagentTier } from "./types";

// ---------------------------------------------------------------------------
// Zcode 7-event subset (no PreCompact/SubagentStop/Task*/Worktree*/TeammateIdle)
// ---------------------------------------------------------------------------

const ZCODE_HOOK_EVENTS: ReadonlySet<HookEvent> = new Set<HookEvent>([
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function envStr(name: string): string | null {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Prefer ZCODE_*; fall back to the CLAUDE_* var Zcode compat-injects. */
function zcodeOrClaude(zcodeKey: string, claudeKey: string): string | null {
  return envStr(zcodeKey) ?? envStr(claudeKey);
}

// ---------------------------------------------------------------------------
// ZcodeAdapter
// ---------------------------------------------------------------------------

/**
 * Zcode + GLM-5.2 host adapter. Capability-driven governance derives the
 * 1M-shaped policy (800K budget, optional worker isolation, inline-lean
 * dispatch, per-phase reasoning effort).
 */
export class ZcodeAdapter implements HostAdapter {
  private readonly override: GovernanceOverride;

  constructor(override: GovernanceOverride = {}) {
    this.override = override;
  }

  readonly platform = "zcode" as const;

  paths(): HostPaths {
    return {
      pluginRoot: zcodeOrClaude("ZCODE_PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"),
      pluginData: zcodeOrClaude("ZCODE_PLUGIN_DATA", "CLAUDE_PLUGIN_DATA"),
      projectDir: zcodeOrClaude("ZCODE_PROJECT_DIR", "CLAUDE_PROJECT_DIR"),
    };
  }

  sessionId(): string {
    // Zcode session id priority: ZCODE_SESSION_ID → Claude compat chain → pid.
    const zcodeSession = envStr("ZCODE_SESSION_ID");
    if (zcodeSession) return zcodeSession;
    const resolved = resolveSessionId({
      envClaudeCodeSessionId: envStr("CLAUDE_CODE_SESSION_ID") ?? undefined,
      envLegacyClaudeSessionId: envStr("CLAUDE_SESSION_ID") ?? undefined,
      processPid: process.pid,
    });
    return resolved.value;
  }

  hostVersion(): HostVersion {
    // No Claude semver gate on Zcode; version is informational only.
    return { name: "zcode", version: envStr("ZCODE_VERSION") };
  }

  hookEvents(): ReadonlySet<HookEvent> {
    return ZCODE_HOOK_EVENTS;
  }

  subagentTier(): SubagentTier {
    return "global-only";
  }

  modelCapabilities(): ModelCapabilities {
    return GLM52_CAPABILITIES;
  }

  governance(): GovernancePolicy {
    return deriveGovernance(GLM52_CAPABILITIES, this.override);
  }
}
