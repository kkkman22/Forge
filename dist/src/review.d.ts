/**
 * Review engine — core logic extracted from forge-review/SKILL.md.
 *
 * Implements:
 *   - filterByConfidence:       Filters findings below the confidence threshold
 *   - deduplicateFindings:      Merges findings with matching fingerprints (file + line ±3 + description)
 *   - applyCrossValidation:     Boosts confidence when 2+ reviewers find the same issue
 *   - runReportQualityGate:     Validates the 6-item quality gate on the final report
 *
 * Confidence filtering (from SKILL.md §6):
 *   - confidence ≥ 0.8 → included in report
 *   - confidence 0.5–0.7 → logged to low-confidence file, not in report
 *   - confidence < 0.5 → discarded
 *
 * Deduplication (from SKILL.md §7.1):
 *   - Fingerprint: normalize(filePath) + line_bucket(±3) + normalize(description)
 *   - On match: keep highest severity, highest confidence, most conservative fix route
 *
 * Cross-validation (from SKILL.md §7.2):
 *   - 2+ independent reviewers on same finding → confidence += 0.10 (cap 1.0)
 *
 * Report quality gate (from SKILL.md §7.3):
 *   6 checks: actionable, no false positives, severity calibrated,
 *   line numbers accurate, no linter overlap, no protected file suggestions
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
export interface QualityGateResult {
    passed: boolean;
    items: QualityGateItem[];
}
/** Findings below this confidence are excluded from the final report. */
export declare const CONFIDENCE_THRESHOLD = 0.8;
/** Findings in this range are logged but not in the report. */
export declare const LOW_CONFIDENCE_MIN = 0.5;
/** Confidence boost when 2+ reviewers independently find the same issue. */
export declare const CROSS_VALIDATION_BOOST = 0.1;
/** Maximum confidence value. */
export declare const MAX_CONFIDENCE = 1;
/** Line number tolerance for deduplication fingerprinting. */
export declare const LINE_TOLERANCE = 3;
export interface ConfidenceFilterResult {
    /** Findings with confidence ≥ 0.8 — included in the report. */
    included: ReviewFinding[];
    /** Findings with confidence 0.5–0.7 — logged separately. */
    lowConfidence: ReviewFinding[];
    /** Findings with confidence < 0.5 — discarded. */
    discarded: ReviewFinding[];
}
/**
 * Filter findings by confidence threshold.
 *
 * Per SKILL.md §6:
 *   - ≥ 0.8 → report
 *   - 0.5–0.7 → low-confidence log
 *   - < 0.5 → discard
 */
export declare function filterByConfidence(findings: ReviewFinding[]): ConfidenceFilterResult;
/**
 * Deduplicate findings from multiple reviewers.
 *
 * Per SKILL.md §7.1:
 *   - Match on normalized file path + line proximity (±3) + normalized description
 *   - On match: keep highest severity, highest confidence, most conservative fix route
 *   - Track all contributing reviewers
 */
export declare function deduplicateFindings(findings: ReviewFinding[]): MergedFinding[];
/**
 * Apply cross-validation confidence boost.
 *
 * Per SKILL.md §7.2:
 *   - When 2+ independent reviewers found the same issue → confidence += 0.10 (cap 1.0)
 *   - Mark as crossValidated
 */
export declare function applyCrossValidation(findings: MergedFinding[]): MergedFinding[];
/**
 * Vague language patterns in suggestions that indicate low-quality findings.
 * Configurable: consumers can override via `runReportQualityGate(findings, { vaguePatterns })`.
 */
export declare const DEFAULT_VAGUE_PATTERNS: string[];
/**
 * Style-only keywords in descriptions. P0/P1 severity for style issues
 * indicates miscalibration.
 */
export declare const DEFAULT_STYLE_KEYWORDS: string[];
/**
 * Linter-detectable keywords. Findings about these belong to the linter,
 * not the review report.
 */
export declare const DEFAULT_LINTER_KEYWORDS: string[];
/** Options for customizing quality gate behavior. */
export interface QualityGateOptions {
    vaguePatterns?: string[];
    styleKeywords?: string[];
    linterKeywords?: string[];
}
/**
 * Run the 6-item report quality gate.
 *
 * Per SKILL.md §7.3, checks:
 *   1. Actionable: every finding has a non-empty suggestion
 *   2. No false positives: (caller-asserted, we check suggestion is specific)
 *   3. Severity calibrated: P0/P1 are not used for style-only issues (heuristic)
 *   4. Line number accuracy: all line numbers are positive integers
 *   5. No linter overlap: no findings that are purely formatting issues
 *   6. Protected files: no findings suggesting deletion of .forge/ files
 *
 * Keyword lists are configurable via the options parameter.
 */
export declare function runReportQualityGate(findings: MergedFinding[], options?: QualityGateOptions): QualityGateResult;
