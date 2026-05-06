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
import { extractStringField, parseFrontmatter } from "./frontmatter.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/**
 * Maximum allowed description length in characters. Mirrors the
 * mattpocock/skills guideline adopted by Requirements 3.3.
 */
const MAX_LENGTH = 1024;
/**
 * "Use when" trigger phrase. Case-insensitive, tolerates any whitespace
 * (space, tab, newline) between the two words so authors are free to
 * wrap long descriptions.
 */
const USE_WHEN_PATTERN = /use\s+when/i;
/**
 * Forbidden patterns enumerated by Requirements 3.5. Each entry pairs a
 * regex with a Chinese-localised reason string that surfaces in the
 * error list to help authors identify which rule fired.
 *
 *   - marketing adjectives (best-ever, unbeatable, 最好的, 革命性)
 *   - version numbers (vN.N, e.g. v1.2, v10.0)
 *   - concrete dates (YYYY-MM-DD in the 2020s)
 */
const FORBIDDEN_PATTERNS = [
    { pattern: /(最好的|革命性|best-ever|unbeatable)/i, reason: "营销性语言" },
    { pattern: /\bv\d+\.\d+/, reason: "版本号" },
    { pattern: /\b202\d-\d{2}-\d{2}\b/, reason: "具体日期" },
];
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
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
export function parseSkillFrontmatter(content) {
    const fm = parseFrontmatter(content);
    if (fm === null) {
        return null;
    }
    const name = extractStringField(fm.raw, "name");
    const description = extractStringField(fm.raw, "description");
    const out = {};
    if (name !== null) {
        out.name = name;
    }
    if (description !== null) {
        out.description = description;
    }
    return out;
}
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
export function validateDescription(filePath, content) {
    const parsed = parseSkillFrontmatter(content);
    const description = parsed?.description ?? "";
    const length = description.length;
    const errors = [];
    if (parsed === null) {
        errors.push("缺少 frontmatter");
    }
    if (description === "") {
        if (parsed !== null) {
            errors.push("description 字段缺失或为空");
        }
    }
    if (length > MAX_LENGTH) {
        errors.push(`description 超长：${length} > ${MAX_LENGTH}`);
    }
    const hasUseWhen = description !== "" && USE_WHEN_PATTERN.test(description);
    if (description !== "" && !hasUseWhen) {
        errors.push('description 缺少 "Use when" 触发语');
    }
    const hasForbiddenPatterns = [];
    for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
        if (pattern.test(description)) {
            hasForbiddenPatterns.push(reason);
            errors.push(`description 命中禁用模式：${reason}`);
        }
    }
    return {
        filePath,
        description,
        length,
        hasUseWhen,
        hasForbiddenPatterns,
        valid: errors.length === 0,
        errors,
    };
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
export function validateAllSkills(fs, skillsDir) {
    const paths = fs.listSkillFiles(skillsDir);
    return paths.map((path) => validateDescription(path, fs.readFile(path)));
}
//# sourceMappingURL=skill-description.js.map