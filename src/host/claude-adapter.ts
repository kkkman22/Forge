/**
 * P2 zcode-p2-native-architecture — Claude Code HostAdapter implementation.
 *
 * Reads Claude-injected env vars for paths/session, exposes the full hook
 * event set (incl PreCompact/SubagentStop), workspace subagent tier, and the
 * 200K Claude model capabilities. Governance is derived capability-driven.
 *
 * Under a Claude host this adapter reproduces the pre-P2 baseline byte-for-byte
 * — it reads the same env vars the kernel previously read directly.
 *
 * **Validates: requirements R1-AC1, R1-AC2, R1-AC5, R1-AC6, R1-AC7 (Claude).**
 */

import { resolveSessionId } from "../session-id.js";
import {
  CLAUDE_CAPABILITIES,
  type GovernancePolicy,
  type ModelCapabilities,
} from "./capabilities.js";
import { deriveGovernance, type GovernanceOverride } from "./governance.js";
import type { HookEvent, HostAdapter, HostPaths, HostVersion, SubagentTier } from "./types.js";

// ---------------------------------------------------------------------------
// Claude full hook event set (superset of the Zcode 7-event subset)
// ---------------------------------------------------------------------------

const CLAUDE_HOOK_EVENTS: ReadonlySet<HookEvent> = new Set<HookEvent>([
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "PreCompact",
  "PostCompact",
  "SubagentStop",
  "TaskStart",
  "TaskCompleted",
  "TaskFailed",
  "WorktreeCreate",
  "WorktreeEnter",
  "WorktreeLeave",
  "TeammateIdle",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function envStr(name: string): string | null {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0 ? v : null;
}

// ---------------------------------------------------------------------------
// ClaudeAdapter
// ---------------------------------------------------------------------------

/**
 * Claude Code host adapter. Capability-driven governance; structural props
 * reflect the Claude host (full hook events, workspace subagents, 200K model).
 *
 * Governance override is optional — when omitted, defaults are derived purely
 * from CLAUDE_CAPABILITIES (capability-driven).
 */
export class ClaudeAdapter implements HostAdapter {
  private readonly override: GovernanceOverride;

  constructor(override: GovernanceOverride = {}) {
    this.override = override;
  }

  readonly platform = "claude-code" as const;

  paths(): HostPaths {
    return {
      pluginRoot: envStr("CLAUDE_PLUGIN_ROOT"),
      pluginData: envStr("CLAUDE_PLUGIN_DATA"),
      projectDir: envStr("CLAUDE_PROJECT_DIR"),
    };
  }

  sessionId(): string {
    // Delegate to the existing priority-chain resolver so consistency semantics
    // (hook → CLAUDE_CODE_SESSION_ID → CLAUDE_SESSION_ID → pid) are preserved.
    const resolved = resolveSessionId({
      envClaudeCodeSessionId: envStr("CLAUDE_CODE_SESSION_ID") ?? undefined,
      envLegacyClaudeSessionId: envStr("CLAUDE_SESSION_ID") ?? undefined,
      processPid: process.pid,
    });
    return resolved.value;
  }

  hostVersion(): HostVersion {
    // Claude version is read elsewhere for the semver gate; here we only report
    // the host name. The version string is best-effort (env or null).
    return { name: "claude-code", version: envStr("CLAUDE_CODE_VERSION") };
  }

  hookEvents(): ReadonlySet<HookEvent> {
    return CLAUDE_HOOK_EVENTS;
  }

  subagentTier(): SubagentTier {
    return "workspace";
  }

  modelCapabilities(): ModelCapabilities {
    return CLAUDE_CAPABILITIES;
  }

  governance(): GovernancePolicy {
    return deriveGovernance(CLAUDE_CAPABILITIES, this.override);
  }
}
