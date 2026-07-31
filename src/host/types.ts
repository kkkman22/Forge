/**
 * P2 zcode-p2-native-architecture — HostAdapter interface.
 *
 * One kernel, runtime-injected adapter. The kernel never reads `CLAUDE_*` env
 * directly nor branches on `if (isZcode)`; it asks the injected HostAdapter for
 * structural properties (paths, session, version, hook events, subagent tier)
 * and model capabilities, then derives governance from capabilities.
 *
 * Platform name is legitimate ONLY for structural differences (which hook
 * events exist, subagent tier). Governance derivation is capability-driven
 * (see ./governance.ts).
 *
 * **Validates: requirements R1-AC1, R1-AC4.**
 */
import type { GovernancePolicy, ModelCapabilities } from "./capabilities";

// ---------------------------------------------------------------------------
// Structural types (platform-driven)
// ---------------------------------------------------------------------------

/** Host platform identifier. Only used for structural differences. */
export type Platform = "claude-code" | "zcode";

/** Subagent discovery tier: workspace (Claude) vs global-only (Zcode Beta). */
export type SubagentTier = "workspace" | "global-only";

/** Hook events recognized across hosts. Zcode supports a 7-event subset. */
export type HookEvent =
  // — shared (Zcode 7-event subset) —
  | "SessionStart"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PermissionRequest"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "Stop"
  // — Claude-only —
  | "PreCompact"
  | "PostCompact"
  | "SubagentStop"
  | "TaskStart"
  | "TaskCompleted"
  | "TaskFailed"
  | "WorktreeCreate"
  | "WorktreeEnter"
  | "WorktreeLeave"
  | "TeammateIdle";

/** Resolved plugin/project paths. Null when the host injects no value. */
export interface HostPaths {
  /** Plugin root directory (CLAUDE/ZCODE_PLUGIN_ROOT). */
  readonly pluginRoot: string | null;
  /** Plugin persistent data directory (CLAUDE/ZCODE_PLUGIN_DATA). */
  readonly pluginData: string | null;
  /** Project directory (CLAUDE/ZCODE_PROJECT_DIR or cwd fallback by caller). */
  readonly projectDir: string | null;
}

/** Host name + version, for display and (Claude only) semver gating. */
export interface HostVersion {
  readonly name: string;
  readonly version: string | null;
}

// ---------------------------------------------------------------------------
// HostAdapter interface
// ---------------------------------------------------------------------------

/**
 * Runtime host adapter. Injected once per process (see ./detect.ts); the kernel
 * calls methods on this interface rather than reading host env directly.
 *
 * Method names are implementation suggestions, not acceptance criteria (Spec
 * forbids identifiers as AC). The data-contract field names on the returned
 * types (contextWindow, pluginRoot, …) ARE the contract.
 */
export interface HostAdapter {
  /** Platform identifier (structural differences only). */
  readonly platform: Platform;

  /** Resolved plugin/project paths (null when host injects nothing). */
  paths(): HostPaths;

  /** Session id, walking the host's priority chain (hook → env → pid). */
  sessionId(): string;

  /** Host name + version. Claude applies a semver gate; Zcode does not. */
  hostVersion(): HostVersion;

  /** Set of hook events available on this host. */
  hookEvents(): ReadonlySet<HookEvent>;

  /** Subagent discovery tier. */
  subagentTier(): SubagentTier;

  /** Model capabilities backing the host (capability-driven governance source). */
  modelCapabilities(): ModelCapabilities;

  /** Derived operational governance (capability-driven + config overrides). */
  governance(): GovernancePolicy;
}
