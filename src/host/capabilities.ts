/**
 * P2 zcode-p2-native-architecture — model capabilities + governance contracts.
 *
 * Capability-driven governance: operational parameters (budget, concurrency,
 * worker isolation, dispatch mode) are derived from model capabilities, not
 * from a platform name. Two equal capability sets derive equal governance,
 * so a future Claude 1M model auto-adopts the GLM-5.2-shaped policy with zero
 * code change (V13).
 *
 * The numbers below are the data contract fixed by
 * `.forge/specs/zcode-p2-native-architecture/design.md` (R1 table).
 *
 * **Validates: requirements R1-AC3, R2-AC1.**
 */

// ---------------------------------------------------------------------------
// Model capabilities
// ---------------------------------------------------------------------------

/**
 * Capabilities of the model backing the host. Drives governance derivation.
 *
 * `contextWindow` is the *real* variable behind budget/slice/concurrency —
 * the platform name is only today's Claude=200K / GLM-5.2=1M coincidence.
 */
export interface ModelCapabilities {
  /** Max input context tokens. Claude≈200K, GLM-5.2=1M. */
  readonly contextWindow: number;
  /** Max output tokens. Claude≈64K, GLM-5.2=128K. */
  readonly maxOutput: number;
  /** Cross-task engineering judgement retention (GLM-5.2 Long Horizon). */
  readonly supportsLongHorizon: boolean;
  /** Per-call reasoning effort control. */
  readonly supportsReasoningEffort: boolean;
  /** Explicit thinking mode toggle. */
  readonly supportsThinkingMode: boolean;
  /** 0-1 context-cache hit efficiency; influences slice aggressiveness. */
  readonly contextCacheEfficiency: number;
}

/**
 * Claude Code baseline model capabilities (200K context).
 *
 * Source: design.md R1 — ClaudeAdapter contract.
 */
export const CLAUDE_CAPABILITIES: ModelCapabilities = Object.freeze({
  contextWindow: 200000,
  maxOutput: 64000,
  supportsLongHorizon: false,
  supportsReasoningEffort: false,
  supportsThinkingMode: false,
  contextCacheEfficiency: 0.5,
});

/**
 * Zcode + GLM-5.2 model capabilities (1M context, Long Horizon).
 *
 * Source: design.md R1 — ZcodeAdapter contract; GLM-5.2 spec
 * (docs.z.ai/guides/llm/glm-5.2).
 */
export const GLM52_CAPABILITIES: ModelCapabilities = Object.freeze({
  contextWindow: 1000000,
  maxOutput: 128000,
  supportsLongHorizon: true,
  supportsReasoningEffort: true,
  supportsThinkingMode: true,
  contextCacheEfficiency: 0.85,
});

// ---------------------------------------------------------------------------
// Governance policy
// ---------------------------------------------------------------------------

/** Worker isolation strategy, derived from Long Horizon support. */
export type WorkerIsolation = "required" | "optional";

/** Decide-phase dispatch mode, derived from context window. */
export type DecideDispatchMode = "auto" | "inline-lean";

/** Per-phase reasoning effort, only when the model supports it. */
export interface ReasoningEffortMap {
  readonly decide: "max";
  readonly spec: "max";
  readonly plan: "high";
  readonly build: "medium";
  readonly review: "high";
  readonly ship: "medium";
}

/**
 * Operational governance parameters, derived from model capabilities.
 *
 * Iron-law fields (TDD, verification, three-strike, isolated review, P0/P1,
 * knowledge, gate thresholds) are deliberately NOT here — they are immutable
 * under constitution §5.6 and are not derived from capabilities.
 */
export interface GovernancePolicy {
  /** Context token budget = 0.8 × contextWindow (20% output/system margin). */
  readonly contextBudget: number;
  /** Context slice trigger = 0.9 × contextBudget. */
  readonly sliceThreshold: number;
  /** Worker isolation: optional when Long Horizon retains judgement. */
  readonly workerIsolation: WorkerIsolation;
  /** Max parallel subagents: 8 when contextWindow >= 500K, else 6. */
  readonly maxParallelAgents: number;
  /** Decide dispatch mode: inline-lean when contextWindow >= 500K. */
  readonly decideDispatchMode: DecideDispatchMode;
  /** Per-phase reasoning effort, or undefined when unsupported. */
  readonly reasoningEffort: ReasoningEffortMap | undefined;
}
