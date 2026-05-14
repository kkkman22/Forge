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
import { describe, expect, it } from "vitest";
import { PATTERNS } from "../src/prompt-defense-patterns.js";
const VALID_TYPES = new Set([
    "instruction_override",
    "jailbreak",
    "role_switching",
    "context_manipulation",
    "encoding_attack",
    "pii_exposure",
]);
const VALID_SEVERITIES = new Set([
    "critical",
    "high",
    "medium",
    "low",
]);
const MIN_PER_CATEGORY = {
    instruction_override: 4,
    jailbreak: 6,
    role_switching: 4,
    context_manipulation: 6,
    encoding_attack: 2,
    pii_exposure: 8,
};
function countByType() {
    const counts = {
        instruction_override: 0,
        jailbreak: 0,
        role_switching: 0,
        context_manipulation: 0,
        encoding_attack: 0,
        pii_exposure: 0,
    };
    for (const p of PATTERNS) {
        counts[p.type] += 1;
    }
    return counts;
}
describe("prompt-defense PATTERNS — structural contract", () => {
    it("has at least 30 total patterns", () => {
        expect(PATTERNS.length).toBeGreaterThanOrEqual(30);
    });
    it("has unique kebab-case ids", () => {
        const ids = PATTERNS.map((p) => p.id);
        const unique = new Set(ids);
        expect(unique.size).toBe(ids.length);
        const kebab = /^[a-z]+(?:-[a-z0-9]+)+$/;
        for (const id of ids) {
            expect(id, `id "${id}" should be kebab-case`).toMatch(kebab);
        }
    });
    it("meets the minimum pattern count for every category", () => {
        const counts = countByType();
        for (const [type, min] of Object.entries(MIN_PER_CATEGORY)) {
            expect(counts[type], `category ${type} has ${counts[type]} patterns, expected >= ${min}`).toBeGreaterThanOrEqual(min);
        }
    });
    it("uses valid ThreatType and ThreatSeverity on every entry", () => {
        for (const p of PATTERNS) {
            expect(VALID_TYPES.has(p.type), `unknown type on ${p.id}`).toBe(true);
            expect(VALID_SEVERITIES.has(p.severity), `unknown severity on ${p.id}`).toBe(true);
        }
    });
    it("sets baseConfidence within [0, 1]", () => {
        for (const p of PATTERNS) {
            expect(p.baseConfidence, `${p.id} baseConfidence out of range`).toBeGreaterThanOrEqual(0);
            expect(p.baseConfidence, `${p.id} baseConfidence out of range`).toBeLessThanOrEqual(1);
        }
    });
    it("exposes RegExp instances as the pattern field", () => {
        for (const p of PATTERNS) {
            expect(p.pattern, `${p.id} pattern should be a RegExp`).toBeInstanceOf(RegExp);
        }
    });
    it("provides a non-empty description on every entry", () => {
        for (const p of PATTERNS) {
            expect(p.description.trim().length, `${p.id} has empty description`).toBeGreaterThan(0);
        }
    });
    it("uses category-matching id prefixes", () => {
        const prefixByType = {
            instruction_override: "io-",
            jailbreak: "jb-",
            role_switching: "rs-",
            context_manipulation: "cm-",
            encoding_attack: "ea-",
            pii_exposure: "pii-",
        };
        for (const p of PATTERNS) {
            expect(p.id.startsWith(prefixByType[p.type]), `${p.id} should start with "${prefixByType[p.type]}" for type ${p.type}`).toBe(true);
        }
    });
});
describe("prompt-defense PATTERNS — description PII hygiene", () => {
    // Best-effort check: descriptions are human-readable metadata and should
    // not contain concrete PII / secret values that could leak via logs.
    const PII_SHAPES = [
        { name: "raw email", re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i },
        { name: "SSN-shaped number", re: /\b\d{3}-\d{2}-\d{4}\b/ },
        { name: "Anthropic key", re: /\bsk-ant-[A-Za-z0-9_-]{8,}/ },
        { name: "OpenAI-style key", re: /\bsk-[A-Za-z0-9]{16,}/ },
        { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{16,}/ },
        { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
        { name: "JWT token", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
    ];
    it.each(PATTERNS.map((p) => [p.id, p.description]))("%s description does not contain a concrete PII / secret sample", (_id, description) => {
        for (const { name, re } of PII_SHAPES) {
            expect(re.test(description), `description should not embed a ${name}; got "${description}"`).toBe(false);
        }
    });
});
//# sourceMappingURL=prompt-defense-patterns.test.js.map