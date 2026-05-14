/**
 * Unit tests for {@link validateAllSkills} batch entry point.
 *
 * Uses an in-memory `SkillDescriptionFs` adapter so the test never
 * touches the real filesystem. The fixture registers three SKILL.md
 * documents that together cover the three possible outcomes:
 *
 *   1. A valid description (frontmatter present, "Use when" trigger,
 *      within length, no forbidden patterns).
 *   2. A description missing the "Use when" trigger.
 *   3. A description hitting the version-number forbidden pattern.
 *
 * The test asserts both the result array length and per-file
 * valid/errors so regressions in either the dispatch logic or the
 * delegated rule evaluation surface clearly.
 *
 * **Validates: Requirement 3.6**
 */
export {};
