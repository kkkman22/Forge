/**
 * Skill resolver — locale-aware SKILL.md file resolution with fallback.
 *
 * Resolves SKILL.md file paths based on the current locale, supporting
 * locale-specific files (e.g. `SKILL.zh.md`) with automatic fallback to
 * the default `SKILL.md`. All public functions are pure: no side effects,
 * no direct filesystem access.
 *
 * **Validates: Requirements 5.1, 5.2, 5.4**
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of resolving a SKILL file path for a given locale. */
export interface SkillResolution {
  /** Resolved file path (e.g. "skills/tinkerman-build/SKILL.zh.md"). */
  filePath: string;
  /** Whether the resolution fell back to the default SKILL.md. */
  isFallback: boolean;
  /** The locale that was ultimately used for resolution. */
  resolvedLocale: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an ordered list of candidate SKILL file paths for a given skill
 * and locale.
 *
 * When `locale` differs from `defaultLocale`, the locale-specific path
 * appears first, followed by the default path:
 *   `["skills/{name}/SKILL.{locale}.md", "skills/{name}/SKILL.md"]`
 *
 * When `locale` equals `defaultLocale`, only the default path is returned:
 *   `["skills/{name}/SKILL.md"]`
 *
 * @param skillName - Skill directory name (e.g. "forge-build")
 * @param locale - Current locale code (e.g. "zh")
 * @param defaultLocale - Default locale code (e.g. "en")
 * @returns Candidate paths ordered by priority (highest first)
 */
export function buildSkillCandidates(
  skillName: string,
  locale: string,
  defaultLocale: string,
): string[] {
  const defaultPath = `skills/${skillName}/SKILL.md`;

  if (locale === defaultLocale) {
    return [defaultPath];
  }

  const localePath = `skills/${skillName}/SKILL.${locale}.md`;
  return [localePath, defaultPath];
}

/**
 * Resolve a SKILL file from a list of candidate paths using an injected
 * existence check.
 *
 * Iterates through `candidates` and returns the first path for which
 * `existsCheck` returns `true`, marked as a non-fallback resolution.
 *
 * If no candidate exists, returns the last candidate (the default
 * `SKILL.md` path) marked as a fallback. This lets the caller decide
 * how to handle a missing file.
 *
 * @param candidates - Ordered candidate paths from `buildSkillCandidates()`
 * @param existsCheck - Injected function that checks whether a path exists
 * @returns Resolution result with the chosen path and fallback status
 */
export function resolveSkillFile(
  candidates: string[],
  existsCheck: (path: string) => boolean,
): SkillResolution {
  for (const candidate of candidates) {
    if (existsCheck(candidate)) {
      // Extract locale from the path: SKILL.{locale}.md or SKILL.md
      const resolvedLocale = extractLocaleFromPath(candidate);
      return { filePath: candidate, isFallback: false, resolvedLocale };
    }
  }

  // No candidate exists — fall back to the last candidate (default SKILL.md)
  const fallbackPath = candidates.length > 0 ? candidates[candidates.length - 1] : "";
  const resolvedLocale = extractLocaleFromPath(fallbackPath);
  return { filePath: fallbackPath, isFallback: true, resolvedLocale };
}

/**
 * Validate that a SKILL file's frontmatter `name` field matches the
 * skill directory name.
 *
 * @param frontmatterName - The `name` field value from frontmatter
 * @param directoryName - The skill directory name (e.g. "forge-build")
 * @returns `true` if the names match, `false` otherwise
 */
export function validateSkillName(frontmatterName: string, directoryName: string): boolean {
  return frontmatterName === directoryName;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract the locale code from a SKILL file path.
 *
 * - `skills/tinkerman-build/SKILL.zh.md` → `"zh"`
 * - `skills/tinkerman-build/SKILL.md`    → `"default"`
 */
function extractLocaleFromPath(filePath: string): string {
  const match = filePath.match(/SKILL\.([^./]+)\.md$/);
  return match ? match[1] : "default";
}
