/**
 * Autofix route classifier + router (ce-inspired-review-enhancement R9).
 *
 * R9 requires each finding to carry an `autofix_class` (the existing FixRoute
 * type) AND a deterministic classifier that maps a finding's characteristics
 * to the right route, plus a router that decides which findings are eligible
 * for automatic application vs. gated vs. manual.
 *
 * Design:
 *   - R9.1: classifyFixRoute maps {severity, hasSuggestion, category} → route.
 *   - R9.2/R9.4: routeForAutofix returns the subset eligible for auto-apply
 *     (safe_auto only) and the subset to gate (gated_auto), excluding
 *     manual/advisory.
 *   - R9.5/R9.6 (run ci_check_command + git-checkout rollback) are wired at
 *     the build-skill layer (they require the full build/test pipeline); this
 *     module provides the pure decision logic they consume.
 */

import type { FixRoute, ReviewFinding, Severity } from "./types.js";

/** Heuristic category of a finding, used to drive route classification (R9.1). */
export type FindingCategory =
  | "naming" // safe_auto: deterministic rename
  | "missing-import" // safe_auto: deterministic add
  | "trivial-null-check" // safe_auto: deterministic guard
  | "error-handling" // gated_auto: touches sensitive boundary
  | "refactor" // gated_auto: structural change
  | "architecture" // manual: design decision
  | "api-design" // manual: API surface decision
  | "adversarial" // advisory: adversarial-check output
  | "performance" // advisory: suggestion only
  | "other"; // fallback

/**
 * Classify a finding's autofix route from its characteristics (R9.1).
 *
 * - safe_auto: local, deterministic fixes (naming, missing import, trivial
 *   null check) — R9.1.
 * - gated_auto: has a specific fix but touches a sensitive boundary (error
 *   handling, refactor) — R9.1.
 * - manual: needs human judgment (architecture, API design) — R9.1.
 * - advisory: report-only (adversarial findings, performance suggestions) — R9.1.
 *
 * P0 findings are NEVER safe_auto (even a "trivial" P0 fix touches a critical
 * path and must be gated) — this protects against an auto-applied fix masking
 * a severe issue.
 */
export function classifyFixRoute(
  category: FindingCategory,
  severity: Severity,
  hasSuggestion: boolean,
): FixRoute {
  // Adversarial + performance are always advisory (report-only).
  if (category === "adversarial" || category === "performance") return "advisory";

  // Architecture + API design always need human judgment.
  if (category === "architecture" || category === "api-design") return "manual";

  // No suggestion → can't auto-apply anything.
  if (!hasSuggestion) return "manual";

  // P0 is never safe-auto regardless of category — too critical to auto-apply.
  if (severity === "P0") return "gated_auto";

  // Safe-auto categories (deterministic, local).
  if (category === "naming" || category === "missing-import" || category === "trivial-null-check") {
    return "safe_auto";
  }

  // Gated-auto categories (touch sensitive boundaries).
  if (category === "error-handling" || category === "refactor") return "gated_auto";

  // Fallback.
  return "manual";
}

/** Result of routing a finding set for autofix mode (R9.2/R9.3/R9.4). */
export interface AutofixRouting {
  /** Findings eligible for silent auto-apply (safe_auto only) — R9.2. */
  autoApply: ReviewFinding[];
  /** Findings to present one-by-one for confirmation (gated_auto) — R9.3. */
  gated: ReviewFinding[];
  /** Findings excluded from autofix entirely (manual + advisory) — R9.4. */
  excluded: ReviewFinding[];
}

/**
 * Route a set of findings for autofix mode (R9.2/R9.3/R9.4).
 *
 * - safe_auto → autoApply (silently applied in --autofix mode).
 * - gated_auto → gated (shown one-by-one for accept/reject/edit).
 * - manual + advisory → excluded (not in the autofix flow at all).
 */
export function routeForAutofix(findings: ReviewFinding[]): AutofixRouting {
  const autoApply: ReviewFinding[] = [];
  const gated: ReviewFinding[] = [];
  const excluded: ReviewFinding[] = [];
  for (const f of findings) {
    switch (f.fixRoute) {
      case "safe_auto":
        autoApply.push(f);
        break;
      case "gated_auto":
        gated.push(f);
        break;
      case "manual":
      case "advisory":
      default:
        excluded.push(f);
        break;
    }
  }
  return { autoApply, gated, excluded };
}
