/**
 * Skill description validator — ensures every `skills/forge-X/SKILL.md`
 * (where `X` is any skill name) frontmatter description follows the
 * "Use when" failure-mode pattern documented in Requirements 3.1–3.5.
 *
 * A well-formed description:
 *   - exists and is non-empty
 *   - contains the phrase "Use when" (case-insensitive, any whitespace
 *     between the two words)
 *   - is at most 1024 characters long
 *   - does not contain forbidden content: marketing language, version
 *     numbers like `v1.2`, or concrete dates like `2026-05-05`
 *
 * The module is IO-free and exposes two pure functions:
 *
 *   - {@link parseSkillFrontmatter} pulls `name` and `description` out
 *     of a SKILL.md text via the shared frontmatter helpers.
 *   - {@link validateDescription} runs the full check list and returns
 *     a structured {@link SkillDescriptionCheck} result.
 *
 * The batch driver (Task 3.2) composes these with file IO; all business
 * rules live here so property tests can exercise them directly.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */
/**
 * Result of validating a single SKILL.md description.
 *
 *   - filePath:             source path passed by the caller, echoed back
 *   - description:          the description string as found (may be empty)
 *   - length:               character count of the description
 *   - hasUseWhen:           true when {@link USE_WHEN_PATTERN} matches
 *   - hasForbiddenPatterns: list of human-readable reasons for each
 *                           forbidden pattern that matched
 *   - valid:                true only when every rule passes
 *   - errors:               human-readable violations; empty iff valid
 */
export interface SkillDescriptionCheck {
    filePath: string;
    description: string;
    length: number;
    hasUseWhen: boolean;
    hasForbiddenPatterns: string[];
    valid: boolean;
    errors: string[];
}
/**
 * Parsed frontmatter subset needed by the description validator.
 * Both fields are optional so callers can distinguish a missing field
 * from an empty string if that distinction matters downstream.
 */
export interface SkillFrontmatter {
    name?: string;
    description?: string;
}
/**
 * Parse a SKILL.md document and extract the `name` and `description`
 * fields from its YAML frontmatter.
 *
 * Behaviour:
 *   - Returns `null` when the document has no frontmatter block.
 *   - Returns an object with `undefined` fields when frontmatter exists
 *     but the specific field is missing, so callers can distinguish
 *     "no frontmatter at all" from "frontmatter present but field
 *     absent".
 *   - Leading / trailing whitespace and surrounding double quotes on
 *     the value are handled by {@link extractStringField}.
 *
 * This function is pure and performs no IO.
 */
export declare function parseSkillFrontmatter(content: string): SkillFrontmatter | null;
/**
 * Validate the `description` frontmatter field of a SKILL.md document
 * against the failure-mode rules in Requirements 3.1–3.5.
 *
 * Rules applied (in the order they appear in the returned `errors`):
 *   1. Frontmatter must exist and contain a non-empty `description`.
 *   2. Length must be ≤ {@link MAX_LENGTH}.
 *   3. Description must contain "Use when" (case-insensitive).
 *   4. Description must not match any {@link FORBIDDEN_PATTERNS} entry.
 *
 * The `valid` flag is `true` if and only if `errors` is empty. The
 * `hasForbiddenPatterns` array lists the `reason` string of each rule
 * that matched, which doubles as the corresponding `errors` entry.
 *
 * This function is pure and performs no IO.
 */
export declare function validateDescription(filePath: string, content: string): SkillDescriptionCheck;
/**
 * Minimal filesystem contract required by {@link validateAllSkills}.
 *
 *   - `listSkillFiles(skillsDir)` — return absolute or relative paths to
 *     every SKILL.md file under a `forge-<name>` subdirectory of
 *     `skillsDir`. The adapter is responsible for the directory scan
 *     and `forge-` prefix filtering so the pure driver stays agnostic
 *     to IO semantics (node:fs glob, recursion, symlinks, etc.).
 *   - `readFile(path)` — read the SKILL.md content at the given path.
 *
 * Adapters backed by `node:fs` should use `readdirSync(skillsDir)` and
 * keep entries whose name starts with `forge-` and which contain a
 * readable `SKILL.md`. The in-memory test adapter can populate a
 * Map-backed store keyed by path.
 */
export interface SkillDescriptionFs {
    listSkillFiles(skillsDir: string): string[];
    readFile(path: string): string;
}
/**
 * Validate every SKILL.md file under each `forge-<name>` subdirectory
 * of `skillsDir` in one batch.
 *
 * Behaviour:
 *   - Delegates path enumeration to `fs.listSkillFiles(skillsDir)`.
 *   - For each path, reads the content via `fs.readFile` and runs
 *     {@link validateDescription}.
 *   - Returns the results in the same order the adapter returned paths.
 *
 * The function is thin and IO-only: all rule logic lives in
 * {@link validateDescription}. Callers that need a non-zero exit code
 * can filter for `result.valid === false`.
 *
 * **Validates: Requirement 3.6**
 */
export declare function validateAllSkills(fs: SkillDescriptionFs, skillsDir: string): SkillDescriptionCheck[];
