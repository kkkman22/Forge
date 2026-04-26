/**
 * Frozen file protection — checks if a .forge/ state file is in a frozen state.
 *
 * Reads the file's YAML frontmatter and checks the `status` field.
 * Exits with code 1 for "locked" or "approved" files (frozen zone).
 * Exits with code 0 for all other cases.
 *
 * Replaces the shell-based check-frozen.sh with a more robust TypeScript
 * implementation that correctly handles YAML frontmatter format variants
 * (quoted/unquoted values, varying whitespace).
 *
 * **Validates: Requirements REQ-4**
 */

import { existsSync, readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Statuses that indicate a file is frozen and must not be modified. */
const FROZEN_STATUSES = ["locked", "approved"];

/** Path patterns that define the frozen zone within .forge/. */
const FROZEN_ZONE_PATTERNS = [".forge/specs/", ".forge/plans/", ".forge/config.md"];

// ---------------------------------------------------------------------------
// Pure helpers (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Determine whether a file path falls within a frozen zone.
 *
 * Frozen zones are directories and files under `.forge/` that contain
 * spec/plan state and should not be modified when their status is locked
 * or approved.
 *
 * @param filePath  The path to check.
 * @returns `true` if the path matches a frozen zone pattern.
 */
export function isFrozenZonePath(filePath: string): boolean {
  return FROZEN_ZONE_PATTERNS.some((pattern) => filePath.includes(pattern));
}

/**
 * Extract the `status` value from YAML frontmatter in a string.
 *
 * Expects the content to start with `---` (after optional leading whitespace
 * is already trimmed by the caller). Searches for a `status:` line within
 * the frontmatter block delimited by opening and closing `---` markers.
 *
 * Handles both quoted and unquoted values:
 * - `status: locked`
 * - `status: "locked"`
 *
 * @param content  The full file content.
 * @returns The extracted status string, or `null` if not found.
 */
export function extractStatus(content: string): string | null {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return null;

  // Find the closing --- marker (skip the opening one)
  const endIndex = trimmed.indexOf("\n---", 3);
  if (endIndex === -1) return null;

  const frontmatter = trimmed.slice(3, endIndex);
  const statusMatch = frontmatter.match(/^status:\s*"?([^"\n]*)"?\s*$/m);
  return statusMatch ? statusMatch[1].trim() : null;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

/**
 * Main CLI function — reads a file path from argv, checks frozen status,
 * and exits with the appropriate code.
 */
function main(): void {
  const targetFile = process.argv[2];

  // No file argument — nothing to check
  if (!targetFile) process.exit(0);

  // Not in a frozen zone — allow
  if (!isFrozenZonePath(targetFile)) process.exit(0);

  // File doesn't exist yet — new files are always allowed
  if (!existsSync(targetFile)) process.exit(0);

  const content = readFileSync(targetFile, "utf-8");
  const status = extractStatus(content);

  if (status && FROZEN_STATUSES.includes(status)) {
    console.log(`🔒 写入被阻断：${targetFile} 状态为 "${status}"，属于冻结区。`);
    console.log("需要用户明确解锁后才能修改。请勿重试此写入操作。");
    process.exit(1);
  }

  process.exit(0);
}

main();
