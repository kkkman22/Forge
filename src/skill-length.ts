/**
 * Skill length validator — enforces the Progressive Disclosure discipline
 * that every `skills/tinkerman-<name>/SKILL.md` main file stays within the
 * configured effective-line budget (default 150). Content above the
 * budget must move to `skills/tinkerman-<name>/references/*.md` so cold
 * knowledge loads on demand rather than front-loading into every call.
 *
 * The module is IO-free and exposes pure functions plus a thin batch
 * driver that accepts a minimal {@link SkillLengthFs} adapter. The
 * adapter enumerates every SKILL.md under `skills/**` (including
 * `skills/shared/*.md` which is exempted by rule, see Requirements 5.5)
 * so callers do not have to re-implement directory traversal.
 *
 * Effective-line counting excludes blank lines (lines that are empty
 * after trimming whitespace). Frontmatter, headers, and prose all count
 * toward the budget; only truly empty lines are free.
 *
 * Exemption rule: any file whose path contains a `/shared/` segment is
 * marked `exempt = true` and always reports `valid = true` regardless
 * of line count. The shared directory holds cross-skill protocol
 * references (Requirements 5.5) that deliberately live outside the
 * per-skill budget.
 *
 * **Validates: Requirements 5.1, 5.5, 5.8**
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of checking a single SKILL.md file against the line-count
 * budget.
 *
 *   - filePath:           source path passed by the caller, echoed back
 *   - lineCount:          raw line count (split on `\n`, trailing empty
 *                         line from a trailing newline not counted)
 *   - effectiveLineCount: lines that remain non-empty after trimming
 *   - limit:              the budget used for this check (default 150)
 *   - exempt:             true when the file is under a `shared/` path
 *   - valid:              true when exempt or effectiveLineCount ≤ limit
 */
export interface SkillLengthCheck {
  filePath: string;
  lineCount: number;
  effectiveLineCount: number;
  limit: number;
  exempt: boolean;
  valid: boolean;
}

/**
 * Minimal filesystem contract required by {@link validateAllSkillLengths}.
 *
 *   - `listSkillMdFiles(skillsDir)` — return every `*.md` file under
 *     `skillsDir` that should participate in the length check. Adapters
 *     are expected to include `skills/tinkerman-<name>/SKILL.md` and
 *     `skills/shared/*.md` (the exempt group is reported but never
 *     fails). References under `references/` subdirectories are out of
 *     scope.
 *   - `readFile(path)` — read the UTF-8 contents at the given path.
 *
 * Keeping the adapter tiny lets the pure driver stay agnostic to any
 * `node:fs` semantics; tests back it with a simple `Map`.
 */
export interface SkillLengthFs {
  listSkillMdFiles(skillsDir: string): string[];
  readFile(path: string): string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default effective-line budget. Aligned with Requirements 5.1 which
 * relaxes the upstream `mattpocock/skills` rule of 100 lines by 50% to
 * accommodate Forge's structured output blocks.
 */
export const DEFAULT_LIMIT = 150;

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Count the number of effective (non-empty) lines in a text buffer.
 *
 * A line is effective when it contains at least one non-whitespace
 * character. Blank separator lines — common between sections in
 * SKILL.md files — do not count toward the budget so authors are free
 * to format for readability without paying a token-budget tax.
 *
 * Line splitting is `\n`-based. A trailing newline produces an extra
 * empty string at the tail of the split, which is correctly excluded
 * by the emptiness check.
 *
 * Pure; no IO.
 */
export function countEffectiveLines(content: string): number {
  if (content === "") {
    return 0;
  }
  const lines = content.split("\n");
  let count = 0;
  for (const line of lines) {
    if (line.trim() !== "") {
      count++;
    }
  }
  return count;
}

/**
 * Count raw lines in a text buffer, ignoring a single trailing newline.
 *
 * Matches the intuitive "open in editor and look at the last line
 * number" semantics used by `wc -l` when the file ends with `\n`. For
 * the empty string returns 0.
 */
function countRawLines(content: string): number {
  if (content === "") {
    return 0;
  }
  const lines = content.split("\n");
  // Drop a single trailing empty line caused by a final "\n".
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    return lines.length - 1;
  }
  return lines.length;
}

/**
 * Return true when the file sits inside a `shared/` directory segment
 * anywhere in its path. The check is path-segment aware so a directory
 * literally named `shared` (e.g. `skills/shared/next-step-protocol.md`)
 * is matched while a filename that merely contains the substring
 * `shared` is not.
 */
function isInSharedDir(filePath: string): boolean {
  // Normalise Windows separators before segmenting.
  const normalised = filePath.replace(/\\/g, "/");
  const segments = normalised.split("/");
  return segments.includes("shared");
}

/**
 * Check a single SKILL.md file against the line-count budget.
 *
 * Behaviour:
 *   - Counts raw lines and effective (non-empty) lines via
 *     {@link countEffectiveLines}.
 *   - Marks the file exempt when its path contains a `/shared/`
 *     segment (Requirements 5.5). Exempt files are always valid.
 *   - Otherwise valid when `effectiveLineCount ≤ limit`.
 *
 * Pure; no IO.
 */
export function checkSkillLength(
  filePath: string,
  content: string,
  limit: number = DEFAULT_LIMIT,
): SkillLengthCheck {
  const lineCount = countRawLines(content);
  const effectiveLineCount = countEffectiveLines(content);
  const exempt = isInSharedDir(filePath);
  const valid = exempt || effectiveLineCount <= limit;
  return {
    filePath,
    lineCount,
    effectiveLineCount,
    limit,
    exempt,
    valid,
  };
}

/**
 * Validate every SKILL.md file under `skillsDir` in one batch.
 *
 * Delegates enumeration to `fs.listSkillMdFiles(skillsDir)` and reads
 * each file via `fs.readFile`, then applies {@link checkSkillLength}
 * with the supplied `limit`. Results are returned in the order the
 * adapter produced paths. Callers that need a non-zero exit code can
 * filter for `result.valid === false`.
 *
 * **Validates: Requirement 5.8**
 */
export function validateAllSkillLengths(
  fs: SkillLengthFs,
  skillsDir: string,
  limit: number = DEFAULT_LIMIT,
): SkillLengthCheck[] {
  const paths = fs.listSkillMdFiles(skillsDir);
  return paths.map((path) => checkSkillLength(path, fs.readFile(path), limit));
}
