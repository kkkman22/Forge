/**
 * Review report severity parsing — shared by ship-gates and review fallback.
 *
 * T-05 (REQ-04, P0): closes the ship-gate severity parsing漏洞 where nested
 * `severity_counts` reports (block + flow YAML, lower/new_/upper case) were
 * silently read as 0, allowing P0-blocked ships to pass.
 *
 * Design (spec arch-review-remediate-0626 REQ-04, Round 7 根治版):
 * - Receives a parseYaml'd frontmatter object (from `splitFrontmatterAndBody`),
 *   NOT raw text — parseYaml exceptions happen upstream and are caught at the
 *   call site (ship-gates / fallback), never inside extractSeverity.
 * - Aggregate via `Math.max` across all format variants (fail-closed): any
 *   variant > 0 means that severity is present. This defeats the `??`-chain
 *   fail-open where a flat `p0_count: 0` would hide a nested `p0: 5`.
 * - `safeNum` clamps non-finite/negative/non-numeric values to 0, defeating the
 *   NaN-contagion fail-open (`Math.max(NaN,...) === NaN`, `NaN > 0 === false`).
 * - `hasAnySeverityField` predicate lets the fallback ladder preserve its
 *   L2→L3 downgrade semantics (no-evidence → downgrade, NOT treat as 0-finding).
 *
 * @module review/severity-parser
 */

/** Canonical flat field names (source of truth per schema review-report.ts). */
const FLAT_FIELDS = ["p0_count", "p1_count", "p2_count", "p3_count"] as const;

/** Nested severity_counts field-name variants (legacy drift). Order is irrelevant under max. */
const NESTED_FIELD_VARIANTS = ["p0", "new_p0", "P0"] as const;
const NESTED_FIELD_VARIANTS_P1 = ["p1", "new_p1", "P1"] as const;
const NESTED_FIELD_VARIANTS_P2 = ["p2", "new_p2", "P2"] as const;
const NESTED_FIELD_VARIANTS_P3 = ["p3", "new_p3", "P3"] as const;

export interface SeverityCounts {
  p0: number;
  p1: number;
  p2: number;
  p3: number;
}

/**
 * Clamp a value to a non-negative finite integer, else 0.
 *
 * Defeats NaN / -1 / Infinity / non-numeric (string/bool/object/array) fail-open.
 * `Number.isFinite` (no coercion) rejects strings/booleans/objects; the `>= 0`
 * guard rejects negatives. Normal reports never carry such values, so clamping
 * to 0 is security-equivalent (real malformed-input defense is the upstream
 * try/catch around parseYaml → structured fail-closed block).
 */
function safeNum(v: unknown): number {
  return Number.isFinite(v) && (v as number) >= 0 ? (v as number) : 0;
}

/**
 * Coerce a possibly-non-object `severity_counts` value into a record.
 * Handles malformed inputs (arrays, scalars) by treating them as empty.
 */
function asSeverityCountsRecord(v: unknown): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    return {};
  }
  return v as Record<string, unknown>;
}

/**
 * Aggregate a single severity level across flat + nested variants via max.
 * Any variant > 0 wins (fail-closed).
 */
function aggregateLevel(
  flatValue: unknown,
  nestedVariants: readonly string[],
  sc: Record<string, unknown>,
): number {
  let best = safeNum(flatValue);
  for (const key of nestedVariants) {
    const candidate = safeNum(sc[key]);
    if (candidate > best) best = candidate;
  }
  return best;
}

/**
 * Extract P0-P3 severity counts from a parseYaml'd review frontmatter object.
 *
 * Format coverage (YAML parser unifies block/flow style automatically):
 * - Flat canonical: `p0_count`, `p1_count`, `p2_count`, `p3_count`
 * - Nested legacy (lower): `severity_counts: { p0, p1, p2, p3 }`
 * - Nested legacy (new_ prefix): `severity_counts: { new_p0, ... }`
 * - Nested legacy (upper): `severity_counts: { P0, P1, P2, P3 }`
 *
 * Returns `{p0,p1,p2,p3}` (never null). A legal fm with no severity fields
 * returns `{0,0,0,0}` — null is reserved for the caller's "frontmatter failed
 * to parse entirely" signal (see ship-gates parseReviewReportFrontmatter).
 *
 * @param fm - parseYaml'd frontmatter object (may be null/missing → self-guarded)
 */
export function extractSeverity(fm: Record<string, unknown> | null | undefined): SeverityCounts {
  // Round 7 security: self-guard against callers bypassing splitFrontmatterAndBody.
  if (!fm) {
    return { p0: 0, p1: 0, p2: 0, p3: 0 };
  }

  const sc = asSeverityCountsRecord(fm.severity_counts);

  return {
    p0: aggregateLevel(fm.p0_count, NESTED_FIELD_VARIANTS, sc),
    p1: aggregateLevel(fm.p1_count, NESTED_FIELD_VARIANTS_P1, sc),
    p2: aggregateLevel(fm.p2_count, NESTED_FIELD_VARIANTS_P2, sc),
    p3: aggregateLevel(fm.p3_count, NESTED_FIELD_VARIANTS_P3, sc),
  };
}

/**
 * Predicate: does this frontmatter carry ANY severity field (flat or nested)?
 *
 * Used by the review fallback ladder to preserve L2→L3 downgrade semantics:
 * a CI evidence file with no severity info at all must trigger downgrade to L3
 * (conservative), NOT be treated as "0 findings → pass L2". After extractSeverity
 * collapses "no field" to {0,0,0,0}, this predicate is the only way to tell
 * "no evidence" apart from "evidence with zero findings".
 */
export function hasAnySeverityField(fm: Record<string, unknown> | null | undefined): boolean {
  if (!fm) return false;

  if (FLAT_FIELDS.some((k) => fm[k] !== undefined)) {
    return true;
  }

  const sc = asSeverityCountsRecord(fm.severity_counts);
  const allNested = [
    ...NESTED_FIELD_VARIANTS,
    ...NESTED_FIELD_VARIANTS_P1,
    ...NESTED_FIELD_VARIANTS_P2,
    ...NESTED_FIELD_VARIANTS_P3,
  ];
  return allNested.some((k) => sc[k] !== undefined);
}
