/**
 * Unit and property-based tests for the skill length validator.
 *
 * Covers:
 *   - Unit tests for {@link countEffectiveLines} across known inputs
 *     (empty, single line, mixed blanks, CRLF).
 *   - Unit tests for {@link checkSkillLength} at, below, and above the
 *     budget, plus the `shared/` exemption branch.
 *   - Integration test for {@link validateAllSkillLengths} with an
 *     in-memory {@link SkillLengthFs} fixture that mixes exempt and
 *     non-exempt files.
 *   - Property: `countEffectiveLines` is invariant under inserting
 *     arbitrary numbers of blank lines between real lines.
 *
 * **Validates: Requirements 5.1, 5.5, 5.8**
 */
export {};
