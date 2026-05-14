/**
 * Property-based tests for the SkillResolver module.
 *
 * Covers:
 *   - Property 8: SKILL 文件解析与回退
 *
 * **Validates: Requirements 5.1, 5.2**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildSkillCandidates, resolveSkillFile } from "../src/skill-resolver.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Skill names following the forge naming convention. */
const SKILL_NAMES = [
    "forge-build",
    "forge-debug",
    "forge-decide",
    "forge-fix",
    "forge-learn",
    "forge-loop",
    "forge-plan",
    "forge-refactor",
    "forge-resume",
    "forge-review",
    "forge-ship",
    "forge-spec",
    "forge-status",
    "forge-test",
];
/** Locale codes used throughout the tests. */
const LOCALES = ["zh", "en", "ja", "ko", "fr", "de", "es"];
/** Generate a skill name from the known set. */
const skillNameArb = fc.constantFrom(...SKILL_NAMES);
/** Generate a locale code from the known set. */
const localeArb = fc.constantFrom(...LOCALES);
/**
 * Generate a pair of (locale, defaultLocale) that are guaranteed to differ.
 */
const differentLocalesArb = fc.tuple(localeArb, localeArb).filter(([a, b]) => a !== b);
// ---------------------------------------------------------------------------
// Feature: i18n-support, Property 8: SKILL 文件解析与回退
// ---------------------------------------------------------------------------
describe("Feature: i18n-support, Property 8: SKILL 文件解析与回退", () => {
    /**
     * **Validates: Requirements 5.1, 5.2**
     *
     * For any skill name and non-default locale, buildSkillCandidates() returns
     * a candidate list where the locale-specific path (SKILL.{locale}.md)
     * appears before the default path (SKILL.md).
     */
    it("locale-specific path appears before default path for non-default locale", () => {
        fc.assert(fc.property(skillNameArb, differentLocalesArb, (skillName, [locale, defaultLocale]) => {
            const candidates = buildSkillCandidates(skillName, locale, defaultLocale);
            // Must have exactly 2 candidates
            expect(candidates).toHaveLength(2);
            // First candidate is locale-specific
            expect(candidates[0]).toBe(`skills/${skillName}/SKILL.${locale}.md`);
            // Second candidate is the default
            expect(candidates[1]).toBe(`skills/${skillName}/SKILL.md`);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 5.1, 5.2**
     *
     * When locale equals defaultLocale, buildSkillCandidates() returns only
     * the default SKILL.md path.
     */
    it("returns only default path when locale equals defaultLocale", () => {
        fc.assert(fc.property(skillNameArb, localeArb, (skillName, locale) => {
            const candidates = buildSkillCandidates(skillName, locale, locale);
            expect(candidates).toHaveLength(1);
            expect(candidates[0]).toBe(`skills/${skillName}/SKILL.md`);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 5.1, 5.2**
     *
     * resolveSkillFile() returns the first candidate that exists (non-fallback).
     * When the locale-specific file exists, it is chosen over the default.
     */
    it("resolves to first existing candidate (locale-specific preferred)", () => {
        fc.assert(fc.property(skillNameArb, differentLocalesArb, fc.boolean(), fc.boolean(), (skillName, [locale, defaultLocale], localeExists, defaultExists) => {
            // At least one must exist for a non-fallback result
            fc.pre(localeExists || defaultExists);
            const candidates = buildSkillCandidates(skillName, locale, defaultLocale);
            const existingPaths = new Set();
            if (localeExists)
                existingPaths.add(candidates[0]);
            if (defaultExists)
                existingPaths.add(candidates[1]);
            const result = resolveSkillFile(candidates, (p) => existingPaths.has(p));
            expect(result.isFallback).toBe(false);
            if (localeExists) {
                // Locale-specific file should win when it exists
                expect(result.filePath).toBe(candidates[0]);
            }
            else {
                // Only default exists
                expect(result.filePath).toBe(candidates[1]);
            }
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 5.1, 5.2**
     *
     * When no candidate exists, resolveSkillFile() falls back to the default
     * SKILL.md path with isFallback: true.
     */
    it("falls back to default SKILL.md when no candidate exists", () => {
        fc.assert(fc.property(skillNameArb, differentLocalesArb, (skillName, [locale, defaultLocale]) => {
            const candidates = buildSkillCandidates(skillName, locale, defaultLocale);
            // No file exists
            const result = resolveSkillFile(candidates, () => false);
            expect(result.isFallback).toBe(true);
            // Falls back to the last candidate (default SKILL.md)
            expect(result.filePath).toBe(`skills/${skillName}/SKILL.md`);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 5.1, 5.2**
     *
     * For any skill name and locale, all candidates returned by
     * buildSkillCandidates() contain the skill name in the path.
     */
    it("all candidates contain the skill name in the path", () => {
        fc.assert(fc.property(skillNameArb, localeArb, localeArb, (skillName, locale, defaultLocale) => {
            const candidates = buildSkillCandidates(skillName, locale, defaultLocale);
            for (const candidate of candidates) {
                expect(candidate).toContain(`skills/${skillName}/`);
                expect(candidate).toMatch(/SKILL(\.[a-z]+)?\.md$/);
            }
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 5.1, 5.2**
     *
     * resolveSkillFile() with a single-element candidate list (default locale)
     * returns fallback when the file doesn't exist.
     */
    it("single candidate (default locale) falls back correctly", () => {
        fc.assert(fc.property(skillNameArb, localeArb, (skillName, locale) => {
            const candidates = buildSkillCandidates(skillName, locale, locale);
            // File doesn't exist
            const result = resolveSkillFile(candidates, () => false);
            expect(result.isFallback).toBe(true);
            expect(result.filePath).toBe(`skills/${skillName}/SKILL.md`);
            // File exists
            const resultExists = resolveSkillFile(candidates, () => true);
            expect(resultExists.isFallback).toBe(false);
            expect(resultExists.filePath).toBe(`skills/${skillName}/SKILL.md`);
        }), { numRuns: 50 });
    });
});
//# sourceMappingURL=skill-resolver.property.test.js.map