/**
 * Review engine sub-modules — barrel export for backward compatibility.
 *
 * All public exports from sub-modules are re-exported here so existing
 * `import { ... } from "./review.js"` continues to work unchanged.
 */

// Types
export type {
  ConfidenceFilterResult,
  FixRoute,
  MergedFinding,
  QualityGateItem,
  QualityGateOptions,
  QualityGateResult,
  ReviewFinding,
  ReviewReportFrontmatter,
  Severity,
} from "./types.js";
export {
  CONFIDENCE_THRESHOLD,
  CROSS_VALIDATION_BOOST,
  FIX_ROUTE_CONSERVATISM,
  LINE_TOLERANCE,
  LOW_CONFIDENCE_MIN,
  MAX_CONFIDENCE,
  SEVERITY_RANK,
} from "./types.js";

// Core pipeline
export {
  applyCrossValidation,
  deduplicateFindings,
  filterByConfidence,
} from "./core.js";

// Quality gate
export {
  DEFAULT_LINTER_KEYWORDS,
  DEFAULT_STYLE_KEYWORDS,
  DEFAULT_VAGUE_PATTERNS,
  runReportQualityGate,
} from "./quality-gate.js";

// Evolution artefacts
export type {
  ReviewEvolutionArtifacts,
  ReviewEvolutionInput,
} from "./evolution.js";
export {
  buildReviewEvolutionArtifacts,
} from "./evolution.js";

// Subagent orchestration
export type {
  ReviewSubagentContext,
} from "./subagent.js";
export {
  buildReviewSubagents,
  mergeReviewResults,
  processReviewTruncation,
} from "./subagent.js";

// Frontmatter management
export {
  atomicUpdateFrontmatter,
  initReviewFrontmatter,
  markLayerStatus,
} from "./frontmatter.js";

// Fallback ladder
export type {
  FallbackLadderInput,
  FallbackLadderResult,
  FallbackLadderTrace,
  TruncationAwareResult,
} from "./fallback.js";
export {
  runReviewFallbackLadder,
  runReviewWithTruncationHandling,
} from "./fallback.js";
