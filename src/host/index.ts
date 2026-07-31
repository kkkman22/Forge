/**
 * P2 zcode-p2-native-architecture — host adapter layer entry point.
 *
 * Runtime host adapter: one kernel, injected adapter. The kernel asks the
 * adapter for structural props + model capabilities, and derives governance
 * from capabilities (capability-driven, not platform-name branches).
 */

export {
  CLAUDE_CAPABILITIES,
  type DecideDispatchMode,
  GLM52_CAPABILITIES,
  type GovernancePolicy,
  type ModelCapabilities,
  type ReasoningEffortMap,
  type WorkerIsolation,
} from "./capabilities";
export { ClaudeAdapter } from "./claude-adapter";
export {
  configureHostAdapter,
  detectPlatform,
  getHostAdapter,
  resetHostAdapter,
  ZCODE_HOST_SIGNALS,
} from "./detect";
export { deriveGovernance, type GovernanceOverride } from "./governance";
export type {
  HookEvent,
  HostAdapter,
  HostPaths,
  HostVersion,
  Platform,
  SubagentTier,
} from "./types";
export { ZcodeAdapter } from "./zcode-adapter";
