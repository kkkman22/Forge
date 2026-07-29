/**
 * Information-lifecycle classification + context-window budget thresholds.
 *
 * Extracted from `context-budget.ts` (audit P2 #9 god-file split). See
 * `context-budget.ts` for the re-export barrel that preserves the public API.
 */

// ---------------------------------------------------------------------------
// Information Lifecycle type
// ---------------------------------------------------------------------------

/** @public */
export type InformationLifecycle =
  | "persistent"
  | "phase-scoped"
  | "ephemeral"
  | "write-and-discard";

// ---------------------------------------------------------------------------
// Classification mapping
// ---------------------------------------------------------------------------

/** @public */
export interface ClassificationEntry {
  source: string;
  lifecycle: InformationLifecycle;
  trimmer: string | null;
}

/** @public */
export const CLASSIFICATION_MAP: ClassificationEntry[] = [
  { source: "plan-task-list", lifecycle: "persistent", trimmer: null },
  { source: "current-task", lifecycle: "persistent", trimmer: null },
  { source: "key-interfaces", lifecycle: "persistent", trimmer: null },
  { source: "explore-results", lifecycle: "ephemeral", trimmer: "Explore_Summarizer" },
  { source: "review-reports", lifecycle: "write-and-discard", trimmer: "Review_Summarizer" },
  { source: "test-output", lifecycle: "ephemeral", trimmer: "Test_Output_Trimmer" },
  { source: "git-diff", lifecycle: "ephemeral", trimmer: "Git_Output_Limiter" },
  { source: "git-status", lifecycle: "ephemeral", trimmer: "Git_Output_Limiter" },
  { source: "subagent-results", lifecycle: "ephemeral", trimmer: "Subagent_Summary_Protocol" },
  { source: "progress-updates", lifecycle: "write-and-discard", trimmer: null },
  { source: "decision-documents", lifecycle: "write-and-discard", trimmer: null },
  { source: "tdd-test-output", lifecycle: "phase-scoped", trimmer: null },
  { source: "closure-first-probes", lifecycle: "phase-scoped", trimmer: null },
];

/** @public */
export function classifySource(source: string): InformationLifecycle | undefined {
  return CLASSIFICATION_MAP.find((e) => e.source === source)?.lifecycle;
}

// ---------------------------------------------------------------------------
// Model-window-aware thresholds
// ---------------------------------------------------------------------------

/** @public */
export interface ContextWindowBudgetInput {
  configuredBudgetTokens?: number;
  contextWindowTokens?: number;
  warningRatio?: number;
  compactRatio?: number;
  criticalRatio?: number;
}

/** @public */
export interface ContextBudgetThresholds {
  warningTokens: number;
  compactTokens: number;
  criticalTokens: number;
  source: "context-window" | "configured-budget";
}

const DEFAULT_CONFIGURED_BUDGET_TOKENS = 100_000;
const DEFAULT_WARNING_RATIO = 0.3;
const DEFAULT_COMPACT_RATIO = 0.5;
const DEFAULT_CRITICAL_RATIO = 0.7;

function validPositiveInteger(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function validRatio(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1
    ? value
    : fallback;
}

/** @public */
export function computeContextBudgetThresholds(
  input: ContextWindowBudgetInput,
): ContextBudgetThresholds {
  const contextWindowTokens = validPositiveInteger(input.contextWindowTokens);
  const configuredBudgetTokens =
    validPositiveInteger(input.configuredBudgetTokens) ?? DEFAULT_CONFIGURED_BUDGET_TOKENS;
  const baseTokens = contextWindowTokens ?? configuredBudgetTokens;
  const source = contextWindowTokens ? "context-window" : "configured-budget";

  return {
    warningTokens: Math.ceil(baseTokens * validRatio(input.warningRatio, DEFAULT_WARNING_RATIO)),
    compactTokens: Math.ceil(baseTokens * validRatio(input.compactRatio, DEFAULT_COMPACT_RATIO)),
    criticalTokens: Math.ceil(baseTokens * validRatio(input.criticalRatio, DEFAULT_CRITICAL_RATIO)),
    source,
  };
}
