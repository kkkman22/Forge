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
/** YAML frontmatter of a review report written to .forge/reviews/<topic>.md */
export interface ReviewReportFrontmatter {
    topic: string;
    date: string;
    result: "pass" | "fail" | "blocked" | "incomplete";
    /** Commit hash at the time of review. Optional for backward compatibility. */
    reviewed_at_commit?: string;
    p0_count: number;
    p1_count: number;
    p2_count: number;
    p3_count: number;
    /** How the review report was produced. Default: subagent-parallel. */
    methodology?: "subagent-parallel" | "subagent-serial" | "ci-evidence" | "unavailable";
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
import type { Episode, EpisodeTier } from "./episode.js";
import type { Methodology } from "./schemas/review-report.js";
/**
 * Input for {@link buildReviewEvolutionArtifacts}.
 *
 * Drivers classify findings into two buckets after a review run:
 *
 *   - `newPatternSituation` — a one-line summary of a pattern the
 *     reviewers flagged that is **not** present in any
 *     `knowledge/solutions/*.md`. Setting this asks the helper to
 *     produce both a failure episode and an Evolution marker targeting
 *     `forge-review#new_review_pattern`.
 *   - `matchedFailurePattern` — the name of an entry in
 *     `knowledge/known-failures.md` that this review successfully
 *     re-identified. Setting this asks the helper to echo the pattern
 *     name via `patternUpdate` so the driver can call
 *     `updatePatternStats(pattern, "success")` against `instincts.md`.
 *
 * Either, both, or neither field may be set. The helper does no IO.
 */
export interface ReviewEvolutionInput {
    topic: string;
    tier: EpisodeTier;
    newPatternSituation?: string;
    matchedFailurePattern?: string;
}
/** Output of {@link buildReviewEvolutionArtifacts}. Fields are omitted when not applicable. */
export interface ReviewEvolutionArtifacts {
    episode?: Episode;
    markerText?: string;
    patternUpdate?: string;
}
/**
 * Pure helper that turns a review's evolution signals into write-ready
 * artefacts.
 *
 * Behaviour (Requirement 8.5):
 *   - When `newPatternSituation` is a non-empty string, construct a
 *     `FailureContext` with `skill=forge-review` and
 *     `trigger=new_review_pattern`, then delegate to
 *     {@link buildFailureEpisode} and {@link buildFailureEvolutionMarker}.
 *     The resulting episode has `outcome: "failure"` and an id of the
 *     form `ep-YYYY-MM-DD-NNN`; the marker line targets
 *     `forge-review#new_review_pattern`.
 *   - When `matchedFailurePattern` is non-empty, the pattern name is
 *     echoed on `patternUpdate` so the driver can increment the
 *     pattern's success counter. The helper itself performs no updates.
 *   - When neither field is set, an empty object is returned.
 *
 * The function is deterministic: same `(input, now, sequenceInDay)` → same output.
 */
export declare function buildReviewEvolutionArtifacts(input: ReviewEvolutionInput, now: Date, sequenceInDay: number): ReviewEvolutionArtifacts;
import type { SubagentInvocation, SubagentResult } from "./loop-types.js";
import { type TruncationAssessment } from "./truncation-detection.js";
/** Context for building review subagent invocations. */
export interface ReviewSubagentContext {
    hasSpec: boolean;
    specPath?: string;
    changedFiles: string[];
}
export declare function buildReviewSubagents(context: ReviewSubagentContext): SubagentInvocation[];
/**
 * Run truncation detection across review subagent results.
 *
 * Maps each agentType to its ReviewLayer, runs detectTruncation on the raw
 * output, then assesses overall severity via assessTruncationSeverity.
 *
 * Non-review agents (frontend-check, unknown) are skipped.
 *
 * @param results - Successfully completed subagent results from the fallback ladder.
 * @returns TruncationAssessment indicating the degradation action to take.
 */
export declare function processReviewTruncation(results: Array<{
    agentType: string;
    result: string;
}>): TruncationAssessment;
export declare function mergeReviewResults(results: SubagentResult[]): MergedFinding[];
/**
 * Initialize a review progress file with frontmatter (R15.1).
 */
export declare function initReviewFrontmatter(filePath: string, topic: string, reviewers: string[]): void;
/**
 * Update a single layer's status in the review frontmatter (R15.2, R15.3).
 * Sets completed_at when all layers are "done".
 */
export declare function markLayerStatus(filePath: string, layerName: string, status: string): void;
/**
 * Atomically update the YAML frontmatter of a file (R15.4, R15.5).
 * Reads → parses → applies mutator → writes to tmp → renames.
 * On mutator error, the file is left unchanged.
 */
export declare function atomicUpdateFrontmatter(filePath: string, mutator: (fm: Record<string, unknown>) => void): void;
/**
 * Input for the review fallback ladder.
 */
export interface FallbackLadderInput {
    /** Subagent invocations to execute. */
    invocations: SubagentInvocation[];
    /** Executor function for each invocation. */
    executor: (inv: SubagentInvocation) => Promise<SubagentResult>;
    /** Optional path to CI evidence file. */
    ciEvidencePath?: string;
}
/**
 * Output from the review fallback ladder.
 */
export interface FallbackLadderResult {
    /** The methodology used to produce the review. */
    methodology: Methodology;
    /** Successfully completed subagent results. */
    succeeded: Array<{
        agentType: string;
        result: string;
    }>;
    /** Failed subagent records. */
    failed: Array<{
        agentType: string;
        error: string;
    }>;
    /** Trace of fallback ladder execution. */
    trace: FallbackLadderTrace[];
    /** Number of retries performed (0 or 1). */
    retryCount: number;
    /** Signature of L0 failure (e.g., "task-id-purge"). */
    l0FailureSignature?: string;
    /** CI evidence if L2 was used. */
    ciEvidence?: {
        severity_counts: Record<string, number>;
        raw: string;
    };
}
/**
 * Single level execution trace entry.
 */
export interface FallbackLadderTrace {
    level: "L0" | "L1" | "L2" | "L3";
    startedAt: number;
    finishedAt: number;
    outcome: "all-success" | "partial-success" | "all-fail" | "ci-hit" | "ci-miss" | "unavailable";
}
/**
 * Execute the review fallback ladder: L0 → L1 → L2 → L3.
 *
 * L0: Parallel subagent execution (default concurrency)
 * L1: Serial retry (concurrency=1) if L0 all-fail
 * L2: CI evidence if L1 all-fail and file exists
 * L3: Unavailable report if L2 miss
 *
 * @param input - Fallback ladder configuration
 * @returns Fallback ladder result with methodology and trace
 */
export declare function runReviewFallbackLadder(input: FallbackLadderInput): Promise<FallbackLadderResult>;
/**
 * Result of review execution with truncation handling.
 *
 * Extends FallbackLadderResult with optional truncation assessment
 * when subagent results were successfully collected.
 */
export interface TruncationAwareResult extends FallbackLadderResult {
    /** Truncation assessment when subagent results were collected. Undefined if execution failed. */
    truncationAssessment?: TruncationAssessment;
}
/**
 * Execute review with truncation-aware handling.
 *
 * Wraps the standard fallback ladder (L0→L1→L2→L3 for execution failures)
 * with an additional truncation-specific degradation layer:
 *
 *   - After L0 succeeds, runs truncation detection on all results.
 *   - 0-2 layers truncated → return with assessment (proceed/annotate/warn).
 *   - All 3 layers truncated → serial retry (concurrency=1).
 *     - Retry succeeds (not all truncated) → subagent-serial methodology.
 *     - Retry still all truncated → methodology=unavailable (blocks ship).
 *
 * Execution failures (L0 all-fail, L1, L2, L3) are handled by the standard
 * fallback ladder before truncation checking begins.
 *
 * @param input - Fallback ladder configuration.
 * @returns Fallback ladder result extended with truncation assessment.
 */
export declare function runReviewWithTruncationHandling(input: FallbackLadderInput): Promise<TruncationAwareResult>;
