/**
 * Finding_To_Comment_Map — bidirectional mapping between Forge review findings
 * and cmux diff-viewer review comments (cmux-diff-review R2).
 *
 * This is the stable DATA CONTRACT for the cmux-diff-review feature. The actual
 * cmux-side I/O (reading/writing Review_Comment via CLI/socket, attach-to-
 * TextBox encoding) is an Implementation_Gate (G1/G2) — it depends on cmux
 * 0.64.15 Beta APIs that are not yet documented. This module locks the mapping
 * semantics so that when the API stabilizes, only a thin I/O adapter is needed.
 *
 * Design (per cmux-diff-review R2):
 *   - Pure functions (same input → same output), property-testable.
 *   - Bijective within the severity domain (P0|P1|P2|P3) with no information
 *     loss; out-of-domain severities map to P2 without erroring (R2.2).
 *   - Deterministic fallback when file/line is missing (R2.3): line falls back
 *     to 1 (file header); a missing file maps to "<unknown>".
 *   - Reuses Forge's existing review taxonomy (no new severity tiers / layers).
 */

// ---------------------------------------------------------------------------
// Types (JSDoc — this is plain .mjs, consumed by cmux-mirror scripts)
// ---------------------------------------------------------------------------

/**
 * @typedef {"P0"|"P1"|"P2"|"P3"} Severity
 * @typedef {"spec"|"quality"|"security"|"human"|"debug"} SourceLayer
 *
 * @typedef {Object} ForgeFinding
 * @property {string} file
 * @property {number|null} [line]
 * @property {Severity} severity
 * @property {string} message
 * @property {SourceLayer} [source_layer]
 *
 * @typedef {Object} ReviewComment
 * @property {string} file
 * @property {number} line
 * @property {Severity} severity
 * @property {string} message
 * @property {SourceLayer} source_layer
 */

/** @type {Readonly<Record<string, Severity>>} */
const SEverity_ALIAS = Object.freeze({
  // Canonical P0–P3 plus common aliases → canonical.
  p0: "P0",
  p1: "P1",
  p2: "P2",
  p3: "P3",
  critical: "P0",
  high: "P1",
  medium: "P2",
  low: "P3",
  blocker: "P0",
  major: "P1",
  minor: "P3",
  info: "P3",
});

/**
 * Normalize an arbitrary severity value to the canonical P0|P1|P2|P3 enum.
 * Out-of-domain values map to P2 (R2.2) without throwing.
 * @param {unknown} raw
 * @returns {Severity}
 */
export function normalizeSeverity(raw) {
  if (typeof raw === "string") {
    const upper = raw.toUpperCase();
    if (upper === "P0" || upper === "P1" || upper === "P2" || upper === "P3") {
      return upper;
    }
    const aliased = SEverity_ALIAS[raw.toLowerCase()];
    if (aliased) return aliased;
  }
  // Out-of-domain → P2 (R2.2), no error.
  return "P2";
}

/**
 * Forge_Finding → Review_Comment (R2.1).
 * - file → file (missing → "<unknown>")
 * - line → line (missing/null → 1, the file header fallback — R2.3)
 * - severity → severity (normalized)
 * - message → message
 * - source_layer → source_layer (missing → "human")
 * @param {ForgeFinding} finding
 * @returns {ReviewComment}
 */
export function findingToComment(finding) {
  const file = finding.file && typeof finding.file === "string" ? finding.file : "<unknown>";
  const rawLine = typeof finding.line === "number" && Number.isFinite(finding.line) ? finding.line : null;
  return {
    file,
    line: rawLine !== null && rawLine > 0 ? rawLine : 1,
    severity: normalizeSeverity(finding.severity),
    message: typeof finding.message === "string" ? finding.message : "",
    source_layer: finding.source_layer ?? "human",
  };
}

/**
 * Review_Comment → Forge_Finding (R2.1, reverse).
 * - comment.message → message
 * - comment.file + line → file + line
 * - comment.severity → severity (normalized; missing → P2 per R2.2)
 * - comment.source_layer → source_layer (missing → "human")
 * @param {ReviewComment} comment
 * @returns {ForgeFinding}
 */
export function commentToFinding(comment) {
  return {
    file: typeof comment.file === "string" && comment.file ? comment.file : "<unknown>",
    line: typeof comment.line === "number" && comment.line > 0 ? comment.line : null,
    severity: normalizeSeverity(comment.severity),
    message: typeof comment.message === "string" ? comment.message : "",
    source_layer: comment.source_layer ?? "human",
  };
}

/**
 * Bidirectional round-trip check (used by property tests + R2.3 determinism).
 * A finding maps to a comment and back to an equivalent finding (severity
 * normalized, line fallback applied deterministically).
 * @param {ForgeFinding} finding
 * @returns {ForgeFinding}
 */
export function roundTrip(finding) {
  return commentToFinding(findingToComment(finding));
}

/**
 * Map a list of Forge findings to the Comment_Set_Handoff payload (R3.1, R3.2).
 * The payload is an ordered list of comments plus metadata, ready to attach to
 * a TextBox / agent prompt context. Redaction (R3.3) is the caller's job — this
 * function does not inspect message contents.
 * @param {ForgeFinding[]} findings
 * @param {{topic: string, generatedAt?: string}} meta
 * @returns {{topic: string, source: "cmux-diff-review", count: number, generated_at: string, comments: ReviewComment[]}}
 */
export function buildCommentSetHandoff(findings, meta) {
  const comments = (Array.isArray(findings) ? findings : []).map(findingToComment);
  return {
    topic: meta.topic,
    source: "cmux-diff-review",
    count: comments.length,
    generated_at: meta.generatedAt ?? new Date().toISOString(),
    comments,
  };
}
