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

import { existsSync, readFileSync } from "node:fs";
import { extractFrontmatterStatus, getProtectionZone, normalizeForgePath } from "./state.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Statuses that indicate a file is frozen and must not be modified. */
const FROZEN_STATUSES = ["locked", "approved"];

// ---------------------------------------------------------------------------
// Pure helpers (exported for testability)
// ---------------------------------------------------------------------------

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
export function isFrozenZonePath(filePath: string): boolean {
  const relativePath = normalizeForgePath(filePath);
  return getProtectionZone(relativePath) === "frozen";
}

/**
 * Extract the `status` value from YAML frontmatter in a string.
 *
 * Delegates to `extractFrontmatterStatus()` from `state.ts` — the single
 * authority for frontmatter parsing.
 *
 * @param content  The full file content.
 * @returns The extracted status string, or `null` if not found.
 */
export function extractStatus(content: string): string | null {
  return extractFrontmatterStatus(content);
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
