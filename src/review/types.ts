/**
 * Review engine types and constants.
 *
 * @module review/types
 */

export type Severity = "P0" | "P1" | "P2" | "P3";

export type FixRoute = "safe_auto" | "gated_auto" | "manual" | "advisory";

export interface ReviewFinding {
  severity: Severity;
  confidence: number;
  fixRoute: FixRoute;
  filePath: string;
  lineNumber: number;
  description: string;
  suggestion: string;
  reviewer: string;
}

export interface MergedFinding extends ReviewFinding {
  reviewers: string[];
  crossValidated: boolean;
}

export interface QualityGateItem {
  name: string;
  passed: boolean;
}

/** YAML frontmatter of a review report written to .forge/reviews/<topic>.md */
export interface ReviewReportFrontmatter {
  topic: string;
  date: string;
  result: "pass" | "fail" | "blocked" | "incomplete";
  /** Commit hash at the time of review. Optional for backward compatibility. */
  reviewed_at_commit?: string;
  /** Immutable evidence artifact id backing this review verdict. */
  evidence_artifact_id?: string;
  p0_count: number;
  p1_count: number;
  p2_count: number;
  p3_count: number;
  /** How the review report was produced. Default: subagent-parallel. */
  methodology?:
    | "saved-workflow"
    | "subagent-parallel"
    | "subagent-serial"
    | "ci-evidence"
    | "unavailable";
}

export interface QualityGateResult {
  passed: boolean;
  items: QualityGateItem[];
}

export interface ConfidenceFilterResult {
  /** Findings with confidence ≥ 0.8 — included in the report. */
  included: ReviewFinding[];
  /** Findings with confidence 0.5–0.7 — logged separately. */
  lowConfidence: ReviewFinding[];
  /** Findings with confidence < 0.5 — discarded. */
  discarded: ReviewFinding[];
}

/** Options for customizing quality gate behavior. */
export interface QualityGateOptions {
  vaguePatterns?: string[];
  styleKeywords?: string[];
  linterKeywords?: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Findings below this confidence are excluded from the final report. */
export const CONFIDENCE_THRESHOLD = 0.8;

/** Findings in this range are logged but not in the report. */
export const LOW_CONFIDENCE_MIN = 0.5;

/** Confidence boost when 2+ reviewers independently find the same issue. */
export const CROSS_VALIDATION_BOOST = 0.1;

/** Maximum confidence value. */
export const MAX_CONFIDENCE = 1.0;

/** Line number tolerance for deduplication fingerprinting. */
export const LINE_TOLERANCE = 3;

// ---------------------------------------------------------------------------
// Ordering maps (for merge priority)
// ---------------------------------------------------------------------------

export const SEVERITY_RANK: Record<Severity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export const FIX_ROUTE_CONSERVATISM: Record<FixRoute, number> = {
  manual: 0,
  gated_auto: 1,
  safe_auto: 2,
  advisory: 3,
};
