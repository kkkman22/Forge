/**
 * Public API barrel file for forge-loop.
 *
 * Exports only the types and functions intended for external consumption.
 * Internal modules (pua-engine, status-file-ext, context-accumulator,
 * context-injection, frontmatter, state, skill-scheduler, sleep-preventer)
 * are intentionally excluded.
 *
 * **Validates: Requirements 10.1, 10.2, 10.3**
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type {
  AgentInterface,
  AgentOutput,
  AgentResult,
  AgentRunOptions,
  LoopConfig,
  RunLimits,
  TokenUsage,
} from "./loop-types.js";

// ---------------------------------------------------------------------------
// Error hierarchy
// ---------------------------------------------------------------------------

export { CliError } from "./cli-error.js";
export { ForgeError } from "./forge-error.js";

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export { SdkDriver, type SdkDriverConfig, type SdkDriverResult } from "./sdk-driver.js";

// ---------------------------------------------------------------------------
// Agent adapter
// ---------------------------------------------------------------------------

export { SdkAgentAdapter, type SdkAgentAdapterConfig } from "./sdk-agent-adapter.js";

// ---------------------------------------------------------------------------
// Quality gate (public evaluation functions)
// ---------------------------------------------------------------------------

export type { GateResult } from "./quality-gate.js";
export { evaluateReviewGate, evaluateShipGate, evaluateTestGate } from "./quality-gate.js";
