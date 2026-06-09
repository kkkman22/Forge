/**
 * Review engine — re-exports from sub-modules for backward compatibility.
 *
 * All public exports from sub-modules are re-exported here so existing
 * `import { ... } from "./review.js"` continues to work unchanged.
 *
 * Sub-modules (extracted for independent testability):
 *   - review/types.ts        — Type definitions and constants
 *   - review/core.ts         — Confidence filtering, deduplication, cross-validation
 *   - review/quality-gate.ts — 6-item report quality gate
 *   - review/evolution.ts    — Evolution artefact helpers
 *   - review/subagent.ts     — Subagent team building and result merging
 *   - review/frontmatter.ts  — YAML frontmatter atomic rewrite
 *   - review/fallback.ts     — Fallback ladder and truncation retry
 */

// Types
export type {
  ConfidenceFilterResult,
  FallbackLadderInput,
  FallbackLadderResult,
  FallbackLadderTrace,
  FixRoute,
  MergedFinding,
  QualityGateItem,
  QualityGateOptions,
  QualityGateResult,
  ReviewEvidenceWriteResult,
  ReviewEvolutionArtifacts,
  ReviewEvolutionInput,
  ReviewFinding,
  ReviewReportFrontmatter,
  ReviewSubagentContext,
  Severity,
  TruncationAwareResult,
} from "./review/index.js";
// Constants
// Functions — named re-exports for contract test discoverability
export {
  applyCrossValidation,
  atomicUpdateFrontmatter,
  buildReviewEvolutionArtifacts,
  buildReviewSubagents,
  CONFIDENCE_THRESHOLD,
  CROSS_VALIDATION_BOOST,
  DEFAULT_LINTER_KEYWORDS,
  DEFAULT_STYLE_KEYWORDS,
  DEFAULT_VAGUE_PATTERNS,
  deduplicateFindings,
  FIX_ROUTE_CONSERVATISM,
  filterByConfidence,
  initReviewFrontmatter,
  LINE_TOLERANCE,
  LOW_CONFIDENCE_MIN,
  MAX_CONFIDENCE,
  markLayerStatus,
  mergeReviewResults,
  persistReviewEvidenceArtifact,
  processReviewTruncation,
  runReportQualityGate,
  runReviewFallbackLadder,
  runReviewWithTruncationHandling,
  SEVERITY_RANK,
  WORKTREE_EDIT_PREFLIGHT,
} from "./review/index.js";
