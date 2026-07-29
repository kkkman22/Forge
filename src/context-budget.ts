/**
 * Context budget management — data models, classification mapping,
 * serializers and deserializers for context window consumption control.
 *
 * This file is now a re-export barrel. The implementations live in the
 * `context-budget/` submodules (audit P2 #9 god-file split, following the
 * `plan/` + `learn/` + `accept/` precedent). All public exports are
 * re-exported here so existing `import { … } from "../context-budget.js"`
 * callers — including the `src/index.ts` barrel — keep working unchanged.
 *
 * **Validates: Requirements 1.1–1.6, 2.1–2.5, 3.1–3.5, 4.1–4.5,
 * 5.1–5.5, 6.1–6.6, 8.1–8.4, 9.1–9.3, 10.1–10.5**
 */

// ContextBudgetReport
export type { ContextBudgetReport } from "./context-budget/budget-report.js";
export {
  deserializeContextBudgetReport,
  serializeContextBudgetReport,
} from "./context-budget/budget-report.js";
// classification + thresholds
export type {
  ClassificationEntry,
  ContextBudgetThresholds,
  ContextWindowBudgetInput,
  InformationLifecycle,
} from "./context-budget/classification.js";
export {
  CLASSIFICATION_MAP,
  classifySource,
  computeContextBudgetThresholds,
} from "./context-budget/classification.js";
// Explore_Summarizer
export type { ExploreSummary } from "./context-budget/explore.js";
export {
  deserializeExploreSummary,
  serializeExploreResult,
  serializeExploreSummary,
} from "./context-budget/explore.js";
// Git_Output_Limiter
export type { GitDiffSummary, GitStatusSummary } from "./context-budget/git.js";
export {
  deserializeGitDiff,
  deserializeGitStatus,
  serializeGitDiff,
  serializeGitStatus,
} from "./context-budget/git.js";
// Review_Summarizer
export type { ReviewSummary } from "./context-budget/review.js";
export { deserializeReviewSummary, serializeReviewSummary } from "./context-budget/review.js";

// Subagent_Summary_Protocol
export type { SubagentSummary } from "./context-budget/subagent.js";
export {
  deserializeSubagentSummary,
  serializeSubagentSummary,
} from "./context-budget/subagent.js";
// Test_Output_Trimmer
export type { TestOutputSummary } from "./context-budget/test-output.js";
export {
  canParseTestOutput,
  deserializeTestOutput,
  serializeTestOutput,
} from "./context-budget/test-output.js";
