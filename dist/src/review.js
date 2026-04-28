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
// Severity and fix route ordering (for merge priority)
// ---------------------------------------------------------------------------
const SEVERITY_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 };
const FIX_ROUTE_CONSERVATISM = {
    manual: 0,
    gated_auto: 1,
    safe_auto: 2,
    advisory: 3,
};
/**
 * Filter findings by confidence threshold.
 *
 * Per SKILL.md §6:
 *   - ≥ 0.8 → report
 *   - 0.5–0.7 → low-confidence log
 *   - < 0.5 → discard
 */
export function filterByConfidence(findings) {
    const included = [];
    const lowConfidence = [];
    const discarded = [];
    for (const f of findings) {
        if (f.confidence >= CONFIDENCE_THRESHOLD) {
            included.push(f);
        }
        else if (f.confidence >= LOW_CONFIDENCE_MIN) {
            lowConfidence.push(f);
        }
        else {
            discarded.push(f);
        }
    }
    return { included, lowConfidence, discarded };
}
// ---------------------------------------------------------------------------
// Deduplication (SKILL.md §7.1)
// ---------------------------------------------------------------------------
/**
 * Compute a deduplication fingerprint for a finding.
 *
 * Fingerprint = normalize(filePath) + line_bucket(lineNumber, ±3) + normalize(description)
 *
 * Line bucket groups lines within ±3 of each other. We use floor(line / (2*tolerance+1))
 * as a simple bucketing scheme — but for ±3 tolerance, we actually need to check
 * absolute difference during merge, not just bucket. So the fingerprint uses
 * filePath + description only, and line proximity is checked during merge.
 */
function normalizeText(text) {
    return text.toLowerCase().trim().replace(/\s+/g, " ");
}
function fileDescriptionKey(f) {
    return `${normalizeText(f.filePath)}::${normalizeText(f.description)}`;
}
function linesAreClose(a, b) {
    return Math.abs(a - b) <= LINE_TOLERANCE;
}
function higherSeverity(a, b) {
    return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}
function moreConservativeRoute(a, b) {
    return FIX_ROUTE_CONSERVATISM[a] <= FIX_ROUTE_CONSERVATISM[b] ? a : b;
}
/**
 * Deduplicate findings from multiple reviewers.
 *
 * Per SKILL.md §7.1:
 *   - Match on normalized file path + line proximity (±3) + normalized description
 *   - On match: keep highest severity, highest confidence, most conservative fix route
 *   - Track all contributing reviewers
 */
export function deduplicateFindings(findings) {
    const merged = [];
    for (const f of findings) {
        const key = fileDescriptionKey(f);
        let matchIndex = -1;
        for (let i = 0; i < merged.length; i++) {
            const existing = merged[i];
            if (fileDescriptionKey(existing) === key &&
                linesAreClose(existing.lineNumber, f.lineNumber)) {
                matchIndex = i;
                break;
            }
        }
        if (matchIndex === -1) {
            // New unique finding
            merged.push({
                ...f,
                reviewers: [f.reviewer],
                crossValidated: false,
            });
        }
        else {
            // Merge into existing
            const existing = merged[matchIndex];
            existing.severity = higherSeverity(existing.severity, f.severity);
            existing.confidence = Math.max(existing.confidence, f.confidence);
            existing.fixRoute = moreConservativeRoute(existing.fixRoute, f.fixRoute);
            existing.lineNumber = Math.min(existing.lineNumber, f.lineNumber);
            if (!existing.reviewers.includes(f.reviewer)) {
                existing.reviewers.push(f.reviewer);
            }
        }
    }
    return merged;
}
// ---------------------------------------------------------------------------
// Cross-validation (SKILL.md §7.2)
// ---------------------------------------------------------------------------
/**
 * Apply cross-validation confidence boost.
 *
 * Per SKILL.md §7.2:
 *   - When 2+ independent reviewers found the same issue → confidence += 0.10 (cap 1.0)
 *   - Mark as crossValidated
 */
export function applyCrossValidation(findings) {
    return findings.map((f) => {
        if (f.reviewers.length >= 2) {
            return {
                ...f,
                confidence: Math.min(f.confidence + CROSS_VALIDATION_BOOST, MAX_CONFIDENCE),
                crossValidated: true,
            };
        }
        return { ...f };
    });
}
// ---------------------------------------------------------------------------
// Quality gate configuration (exported for customization)
// ---------------------------------------------------------------------------
/**
 * Vague language patterns in suggestions that indicate low-quality findings.
 * Configurable: consumers can override via `runReportQualityGate(findings, { vaguePatterns })`.
 */
export const DEFAULT_VAGUE_PATTERNS = [
    "考虑改进",
    "可能需要",
    "也许应该",
    "consider improving",
    "might need",
];
/**
 * Style-only keywords in descriptions. P0/P1 severity for style issues
 * indicates miscalibration.
 */
export const DEFAULT_STYLE_KEYWORDS = [
    "缩进",
    "分号",
    "空格",
    "格式",
    "indent",
    "semicolon",
    "whitespace",
    "formatting",
];
/**
 * Linter-detectable keywords. Findings about these belong to the linter,
 * not the review report.
 */
export const DEFAULT_LINTER_KEYWORDS = [
    "缺少分号",
    "缩进错误",
    "trailing comma",
    "missing semicolon",
    "indent error",
];
// ---------------------------------------------------------------------------
// Report quality gate (SKILL.md §7.3)
// ---------------------------------------------------------------------------
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
export function runReportQualityGate(findings, options) {
    const vaguePatterns = options?.vaguePatterns ?? DEFAULT_VAGUE_PATTERNS;
    const styleKeywords = options?.styleKeywords ?? DEFAULT_STYLE_KEYWORDS;
    const linterKeywords = options?.linterKeywords ?? DEFAULT_LINTER_KEYWORDS;
    const items = [];
    // 1. Actionable: every finding has a non-empty suggestion
    const allActionable = findings.every((f) => f.suggestion.trim().length > 0);
    items.push({ name: "可操作性", passed: allActionable });
    // 2. No false positives: suggestion should not contain vague language
    const noVagueSuggestions = findings.every((f) => !vaguePatterns.some((p) => f.suggestion.toLowerCase().includes(p.toLowerCase())));
    items.push({ name: "误报排除", passed: noVagueSuggestions });
    // 3. Severity calibrated: P0/P1 should not be for style-only issues
    const severityCalibrated = findings.every((f) => {
        if (f.severity === "P0" || f.severity === "P1") {
            const desc = f.description.toLowerCase();
            return !styleKeywords.some((kw) => desc.includes(kw.toLowerCase()));
        }
        return true;
    });
    items.push({ name: "严重度校准", passed: severityCalibrated });
    // 4. Line number accuracy: all line numbers are positive integers
    const lineNumbersValid = findings.every((f) => Number.isInteger(f.lineNumber) && f.lineNumber > 0);
    items.push({ name: "行号准确性", passed: lineNumbersValid });
    // 5. No linter overlap: findings should not be about formatting
    const noLinterOverlap = findings.every((f) => !linterKeywords.some((kw) => f.description.toLowerCase().includes(kw.toLowerCase())));
    items.push({ name: "不与 Linter 重复", passed: noLinterOverlap });
    // 6. Protected files: no findings suggesting deletion of .forge/ files
    const noProtectedFileSuggestions = findings.every((f) => !f.suggestion.toLowerCase().includes("删除 .forge/") &&
        !f.suggestion.toLowerCase().includes("delete .forge/") &&
        !f.filePath.startsWith(".forge/"));
    items.push({ name: "受保护文件", passed: noProtectedFileSuggestions });
    return {
        passed: items.every((i) => i.passed),
        items,
    };
}
//# sourceMappingURL=review.js.map