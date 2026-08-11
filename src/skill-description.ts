/**
 * Skill description validator — ensures every `skills/tinkerman-X/SKILL.md`
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
import { IMPERATIVE_WHITELIST } from "./skill-description-imperatives.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of validating a single SKILL.md description.
 *
 *   - filePath:             source path passed by the caller, echoed back
 *   - description:          the description string as found (may be empty)
 *   - length:               character count of the description
 *   - hasUseWhen:           true when `USE_WHEN_PATTERN` matches
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

export interface DescriptionValidationExtended extends SkillDescriptionCheck {
  sentenceCount: number;
  firstSentenceStartsWithImperative: boolean;
  secondSentenceStartsWithUseWhen: boolean;
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
const FORBIDDEN_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
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
export function parseSkillFrontmatter(content: string): SkillFrontmatter | null {
  const fm = parseFrontmatter(content);
  if (fm === null) {
    return null;
  }

  const name = extractStringField(fm.raw, "name");
  const description = extractStringField(fm.raw, "description");

  const out: SkillFrontmatter = {};
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
 *   2. Length must be ≤ `MAX_LENGTH`.
 *   3. Description must contain "Use when" (case-insensitive).
 *   4. Description must not match any `FORBIDDEN_PATTERNS` entry.
 *
 * The `valid` flag is `true` if and only if `errors` is empty. The
 * `hasForbiddenPatterns` array lists the `reason` string of each rule
 * that matched, which doubles as the corresponding `errors` entry.
 *
 * This function is pure and performs no IO.
 */
export function validateDescription(filePath: string, content: string): SkillDescriptionCheck {
  const parsed = parseSkillFrontmatter(content);
  const description = parsed?.description ?? "";
  const length = description.length;
  const errors: string[] = [];

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

  const hasForbiddenPatterns: string[] = [];
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

// ---------------------------------------------------------------------------
// Batch validation (Task 3.2)
// ---------------------------------------------------------------------------

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
export function validateAllSkills(
  fs: SkillDescriptionFs,
  skillsDir: string,
): SkillDescriptionCheck[] {
  const paths = fs.listSkillFiles(skillsDir);
  return paths.map((path) => validateDescription(path, fs.readFile(path)));
}

// ---------------------------------------------------------------------------
// Two-sentence format helpers (Requirements 1.2, 1.3, 1.4)
// ---------------------------------------------------------------------------

const SENTENCE_END_RE = /[。.]/;

export function splitSentences(text: string): string[] {
  if (text === "") return [""];
  return text.split(SENTENCE_END_RE);
}

export function countSentences(text: string): number {
  if (text.trim() === "") return 0;
  const parts = splitSentences(text);
  // Filter trailing empty strings from consecutive/trailing punctuation
  const nonEmpty = parts.filter((s) => s.trim() !== "");
  // If all parts are empty after splitting, count as 1 (single unpunctuated sentence)
  return nonEmpty.length === 0 ? 1 : nonEmpty.length;
}

export function startsWithImperative(sentence: string, whitelist: readonly string[]): boolean {
  if (sentence === "") return false;
  const trimmed = sentence.trimStart();
  if (trimmed === "") return false;
  const firstWord = trimmed.split(/\s+/)[0] ?? "";
  return whitelist.includes(firstWord);
}

export function secondSentenceStartsWithUseWhen(sentences: string[]): boolean {
  if (sentences.length < 2) return false;
  // Find the second non-empty sentence
  const nonEmpty = sentences.filter((s) => s.trim() !== "");
  if (nonEmpty.length < 2) return false;
  const second = nonEmpty[1].trimStart();
  return /^use\s+when/i.test(second);
}

// ---------------------------------------------------------------------------
// Extended validation (Requirement 1.6)
// ---------------------------------------------------------------------------

const ENFORCEMENT_MODE: "warning" | "error" = "error";

export function validateDescriptionExtended(
  content: string,
  options?: { mode?: "warning" | "error" },
): DescriptionValidationExtended {
  const mode = options?.mode ?? ENFORCEMENT_MODE;
  const base = validateDescription("extended", content);

  const description = base.description;
  const sentences = splitSentences(description);
  const sentenceCount = countSentences(description);
  const firstSentenceStartsWithImperative =
    description !== "" && startsWithImperative(sentences[0] ?? "", IMPERATIVE_WHITELIST);
  const secondStart = secondSentenceStartsWithUseWhen(sentences);

  const errors = [...base.errors];

  if (description !== "") {
    if (sentenceCount !== 2) {
      errors.push(`description 需要 2 句话，当前 ${sentenceCount} 句`);
    }
    if (!firstSentenceStartsWithImperative) {
      errors.push("description 首句未以祈使动词开头");
    }
    if (!secondStart) {
      errors.push('description 第二句未以 "Use when" 开头');
    }
  }

  const extendedValid = mode === "warning" ? base.valid : errors.length === 0;

  return {
    ...base,
    sentenceCount,
    firstSentenceStartsWithImperative,
    secondSentenceStartsWithUseWhen: secondStart,
    valid: extendedValid,
    errors,
  };
}
