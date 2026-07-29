/**
 * Shared types for the prompt-defense subsystem.
 *
 * Extracted from `prompt-defense.ts` to break the circular dependency between
 * `prompt-defense.ts` (scanner) and `prompt-defense-patterns.ts` (rule library).
 * Previously the pattern library imported `ThreatType` / `ThreatSeverity` from
 * the scanner, while the scanner imported the `PATTERNS` constant from the
 * library — a classic type/value cycle. Both modules now import these types
 * from this dependency-free leaf module.
 *
 * Repo precedent: `router-types.ts`, `session-types.ts`, `grill/types.ts`.
 */

/**
 * Category of a detected prompt-injection / defense threat.
 *
 * Used both by the scanner result shape (`Threat.type`) and by the pattern
 * library (`ThreatPattern.type`) to classify a rule.
 */
export type ThreatType =
  | "instruction_override"
  | "jailbreak"
  | "role_switching"
  | "context_manipulation"
  | "encoding_attack"
  | "pii_exposure";

/**
 * Severity level of a detected threat.
 *
 * Ordered from most to least critical. Downstream routing uses this field
 * to decide between outright rejection (`critical`), warning hints
 * (`high` / `medium`) and silent accumulation (`low`).
 */
export type ThreatSeverity = "critical" | "high" | "medium" | "low";
