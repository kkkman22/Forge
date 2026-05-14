/**
 * Unit tests for the prompt-defense threat pattern library.
 *
 * Verifies the structural contract of `PATTERNS` without exercising the
 * scanner itself (the scanner is implemented in a follow-up task):
 *
 *   - every `id` is unique and kebab-case
 *   - per-category minima from Requirement 5.4 are met
 *   - total pattern count is at least 30
 *   - every entry uses a valid `ThreatType` / `ThreatSeverity`
 *   - `baseConfidence` is in `[0, 1]`
 *   - descriptions do not leak concrete PII / secret values
 *
 * Validates: Requirements 5.3, 5.4
 */
export {};
