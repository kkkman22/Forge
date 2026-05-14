/**
 * Prompt Defense — threat pattern library.
 *
 * Curated, dependency-free regex rules used by `scanInput` to detect
 * prompt-injection, jailbreak, role-switching, context-manipulation,
 * encoding-based obfuscation and PII / secret exposure.
 *
 * ## Contract
 *
 *   - Every entry MUST have a unique `id` in kebab-case, prefixed by the
 *     category short-code (`io-*`, `jb-*`, `rs-*`, `cm-*`, `ea-*`,
 *     `pii-*`).
 *   - Patterns use bounded quantifiers to avoid catastrophic backtracking.
 *     In particular, no pattern contains `.*.*` or unbounded alternations.
 *   - `description` is human-readable metadata used for reporting only. It
 *     MUST NOT contain a concrete PII / secret value, because it surfaces
 *     in logs and error payloads (Requirement 5.12).
 *   - `baseConfidence` reflects how likely a regex match actually indicates
 *     the stated threat. Typical range is 0.70–0.99.
 *
 * ## Distribution (Requirement 5.4)
 *
 *   | Category              | Minimum | Actual |
 *   |-----------------------|---------|--------|
 *   | instruction_override  |     ≥ 4 |     6  |
 *   | jailbreak             |     ≥ 6 |     8  |
 *   | role_switching        |     ≥ 4 |     5  |
 *   | context_manipulation  |     ≥ 6 |     8  |
 *   | encoding_attack       |     ≥ 2 |     3  |
 *   | pii_exposure          |     ≥ 8 |     9  |
 *   | **Total**             |    ≥ 30 |    39  |
 *
 * **Validates: Requirements 5.3, 5.4**
 *
 * **Frozen zone**: modifications to this file require an ADR per
 * Requirement 5.10. Adding, removing, or weakening a rule SHALL be gated
 * through `/forge decide` so that the rationale is captured in an
 * `ADR-NNNN` document before the change lands.
 */
import type { ThreatSeverity, ThreatType } from "./prompt-defense.js";
/**
 * A single threat-detection rule.
 *
 * See the file-level JSDoc for the invariants that every entry must
 * uphold.
 */
export interface ThreatPattern {
    /** Unique kebab-case identifier (e.g. `"io-001"`). */
    id: string;
    /** Regular expression, typically with the `i` (case-insensitive) flag. */
    pattern: RegExp;
    /** Category of the rule. */
    type: ThreatType;
    /** Severity bucket of a confirmed match. */
    severity: ThreatSeverity;
    /** Detection confidence in the inclusive range `[0, 1]`. */
    baseConfidence: number;
    /** Human-readable description — generic only, never includes sample values. */
    description: string;
}
/**
 * Frozen, ordered list of all threat patterns.
 *
 * Consumers should treat this as read-only; the `ReadonlyArray` type
 * enforces that at compile time.
 */
export declare const PATTERNS: ReadonlyArray<ThreatPattern>;
