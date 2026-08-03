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
} from "./capabilities.js";
export { ClaudeAdapter } from "./claude-adapter.js";
export {
  configureHostAdapter,
  detectPlatform,
  getHostAdapter,
  resetHostAdapter,
  ZCODE_HOST_SIGNALS,
} from "./detect.js";
export { deriveGovernance, type GovernanceOverride } from "./governance.js";
export type {
  HookEvent,
  HostAdapter,
  HostPaths,
  HostVersion,
  Platform,
  SubagentTier,
} from "./types.js";
export { type ForgeTier, shouldIsolateWorker } from "./worker-isolation.js";
export { ZcodeAdapter } from "./zcode-adapter.js";
