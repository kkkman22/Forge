/**
 * Frozen file protection — checks if a .forge/ state file is in a frozen state.
 *
 * Reads the file's YAML frontmatter and checks the `status` field.
 * Exits with code 1 for "locked" or "approved" files (frozen zone).
 * Exits with code 0 for all other cases.
 *
 * Delegates path classification and status extraction to `state.ts` to
 * maintain a single source of truth for protection zone rules.
 *
 * **Validates: Requirements REQ-4**
 */
/**
 * Check whether the given path is in the source-tree hard-frozen list.
 *
 * Performs a suffix match against `HARD_FROZEN_SOURCE_FILES` so both
 * repository-relative and absolute paths work. The path is first
 * normalised to use forward slashes.
 */
export declare function isHardFrozenSourceFile(filePath: string): boolean;
/**
 * Determine whether a file path falls within a frozen zone.
 *
 * Uses `normalizeForgePath()` from `state.ts` to resolve `..` sequences,
 * strip redundant separators, and handle absolute/relative path variants
 * before delegating to `getProtectionZone()` — the single authority for
 * protection zone classification.
 *
 * @param filePath  The path to check (may be absolute, relative, or prefixed).
 * @returns `true` if the path is in the frozen zone.
 *
 * **Validates: Requirements 4.1, 4.2, 4.3**
 */
export declare function isFrozenZonePath(filePath: string): boolean;
/**
 * Extract the `status` value from YAML frontmatter in a string.
 *
 * Delegates to `extractFrontmatterStatus()` from `state.ts` — the single
 * authority for frontmatter parsing.
 *
 * @param content  The full file content.
 * @returns The extracted status string, or `null` if not found.
 */
export declare function extractStatus(content: string): string | null;
