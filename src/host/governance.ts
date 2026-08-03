/**
 * P2 zcode-p2-native-architecture — capability-driven governance derivation.
 *
 * The core innovation: governance parameters are derived from model
 * capabilities (contextWindow, supportsLongHorizon, …), not from a platform
 * name. Equal capabilities derive equal governance, so a future Claude 1M
 * model auto-adopts the GLM-5.2-shaped policy with zero code change.
 *
 * Config overrides take precedence over derived defaults (user-tuned values
 * win), but the *default* is always a function of capability — never a
 * scattered `if (platform)` branch.
 *
 * Iron-law fields (gate thresholds, TDD, review isolation, P0/P1, knowledge)
 * are NOT derived here — constitution §5.6 immutable boundary.
 *
 * **Validates: requirements R2-AC2..AC10.**
 */
import type { GovernancePolicy, ModelCapabilities, ReasoningEffortMap } from "./capabilities.js";

// ---------------------------------------------------------------------------
// Derivation constants (single source for thresholds)
// ---------------------------------------------------------------------------

/** Budget = 80% of context window; 20% reserved for output + system overhead. */
const BUDGET_FACTOR = 0.8;

/** Slice trigger = 90% of the context budget. */
const SLICE_FACTOR = 0.9;

/** Context window at/above which concurrency lifts to 8 and dispatch goes lean. */
const LARGE_CONTEXT_THRESHOLD = 500_000;

/** Concurrency when below the large-context threshold. */
const SMALL_CONTEXT_PARALLEL = 6;

/** Concurrency at/above the large-context threshold. */
const LARGE_CONTEXT_PARALLEL = 8;

/**
 * Per-phase reasoning effort mapping when the model supports reasoning_effort.
 * decide/spec get max effort; plan/review get high; build/ship get medium.
 */
const REASONING_EFFORT_MAP: ReasoningEffortMap = Object.freeze({
  decide: "max",
  spec: "max",
  plan: "high",
  build: "medium",
  review: "high",
  ship: "medium",
});

// ---------------------------------------------------------------------------
// Config override contract
// ---------------------------------------------------------------------------

/**
 * Optional user/config overrides that take precedence over derived defaults.
 *
 * - `contextBudgetOverride`: from `.zcode-plugin` userConfig
 *   `context_budget_override`; **0 means "auto-derive"** (not a real budget).
 * - `maxParallelAgents`: from `.forge/config.md` `max_parallel_agents`.
 *
 * Missing or zero/undefined fields fall through to capability-derived defaults.
 */
export interface GovernanceOverride {
  readonly contextBudgetOverride?: number;
  readonly maxParallelAgents?: number;
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/**
 * Derive operational governance from model capabilities, honouring overrides.
 *
 * @param cap - model capabilities (the real driver of budget/concurrency).
 * @param override - optional config overrides (user-tuned values win; 0 = auto).
 * @returns governance policy; iron-law fields are out of scope (§5.6).
 */
export function deriveGovernance(
  cap: ModelCapabilities,
  override: GovernanceOverride,
): GovernancePolicy {
  const w = cap.contextWindow;

  // Budget: override wins, but 0 (and negatives/NaN) means "auto-derive".
  const derivedBudget = Math.floor(w * BUDGET_FACTOR);
  const ov = override.contextBudgetOverride;
  const contextBudget =
    typeof ov === "number" && Number.isFinite(ov) && ov > 0 ? Math.floor(ov) : derivedBudget;

  const isLargeContext = w >= LARGE_CONTEXT_THRESHOLD;

  const maxParallelAgents =
    typeof override.maxParallelAgents === "number" && override.maxParallelAgents > 0
      ? override.maxParallelAgents
      : isLargeContext
        ? LARGE_CONTEXT_PARALLEL
        : SMALL_CONTEXT_PARALLEL;

  return Object.freeze({
    contextBudget,
    sliceThreshold: Math.floor(derivedBudget * SLICE_FACTOR),
    workerIsolation: cap.supportsLongHorizon ? "optional" : "required",
    maxParallelAgents,
    decideDispatchMode: isLargeContext ? "inline-lean" : "auto",
    // Per-phase reasoning effort only when the model supports the knob.
    reasoningEffort: cap.supportsReasoningEffort ? REASONING_EFFORT_MAP : undefined,
  });
}
