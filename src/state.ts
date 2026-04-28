/**
 * State system — core logic extracted from the unified state system design.
 *
 * Implements:
 *   - validateStateFile:  Checks that a .forge/ state file uses .md extension
 *                         and structured data uses YAML frontmatter
 *   - normalizeForgePath: Normalizes file paths to .forge/-relative form,
 *                         resolving `..` sequences, redundant separators,
 *                         and absolute path prefixes.
 *
 * Property 15: 状态文件格式统一
 *   - All state files under .forge/ must have .md extension
 *   - Structured data must use YAML frontmatter (--- delimited block at start)
 *   **Validates: Requirements 11.2**
 */

import * as pathPosix from "node:path/posix";
import { extractStringField, parseFrontmatter } from "./frontmatter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StateFile {
  /** File path relative to .forge/, e.g. "config.md", "specs/feature/spec.md" */
  path: string;
  /** Raw file content. */
  content: string;
}

export interface StateFileValidation {
  valid: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Valid file extension for all state files. */
const VALID_EXTENSION = ".md";

// ---------------------------------------------------------------------------
// State file validation (Property 15)
// ---------------------------------------------------------------------------

/**
 * Validate that a .forge/ state file meets the unified format requirements:
 *
 * 1. File extension must be .md
 * 2. Structured data must use YAML frontmatter (content starts with "---")
 *
 * Per design Property 15 and Requirements 11.2:
 *   - All state files under .forge/ use .md format
 *   - Structured data uses YAML frontmatter
 */
export function validateStateFile(file: StateFile): StateFileValidation {
  const errors: string[] = [];

  // Check 1: File extension must be .md
  if (!file.path.endsWith(VALID_EXTENSION)) {
    const ext = file.path.includes(".") ? file.path.slice(file.path.lastIndexOf(".")) : "(none)";
    errors.push(`文件扩展名不正确：${ext}，应为 ${VALID_EXTENSION}`);
  }

  // Check 2: Content must have valid YAML frontmatter
  const trimmedContent = file.content.trimStart();
  if (!trimmedContent.startsWith("---")) {
    errors.push('缺少 YAML frontmatter：文件内容应以 "---" 开头');
  } else if (parseFrontmatter(file.content) === null) {
    errors.push('YAML frontmatter 未正确关闭：缺少结束的 "---"');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if a file path has the .md extension.
 *
 * Simple utility used by Property 15 tests.
 */
export function hasMarkdownExtension(filePath: string): boolean {
  return filePath.endsWith(VALID_EXTENSION);
}

/**
 * Check if content has valid YAML frontmatter.
 *
 * YAML frontmatter is a block delimited by "---" at the start and end,
 * appearing at the very beginning of the file content.
 */
export function hasYamlFrontmatter(content: string): boolean {
  return parseFrontmatter(content) !== null;
}

// ---------------------------------------------------------------------------
// Path normalization (Req 4)
// ---------------------------------------------------------------------------

/**
 * Normalize a file path to its `.forge/`-relative form.
 *
 * Steps:
 *   1. Unify separators to forward slashes (posix)
 *   2. Apply `path.posix.normalize` to resolve `..` sequences and redundant separators
 *   3. Strip everything up to and including the last `.forge/` marker
 *   4. Remove any leading `./` or `/` from the result
 *
 * Uses lexical normalization only (no `fs.realpath`), which is correct for
 * the Hook use case where we check the path as given, not the resolved target.
 *
 * @param inputPath - Any path variant: absolute, relative, with `..`, redundant separators, etc.
 * @returns The `.forge/`-relative path (e.g. "specs/feature/spec.md"), or the
 *          normalized path as-is if it doesn't contain `.forge/`.
 *
 * **Validates: Requirements 4.1, 4.2, 4.3**
 */
export function normalizeForgePath(inputPath: string): string {
  // Step 1: Unify separators to forward slashes
  let normalized = inputPath.replace(/\\/g, "/");

  // Step 2: Resolve `..` sequences and redundant separators
  normalized = pathPosix.normalize(normalized);

  // Step 3: Find the last `.forge/` marker and extract the relative portion
  const forgeMarker = ".forge/";
  const forgeIndex = normalized.lastIndexOf(forgeMarker);

  if (forgeIndex !== -1) {
    normalized = normalized.slice(forgeIndex + forgeMarker.length);
  }

  // Step 4: Remove leading `./` or `/`
  normalized = normalized.replace(/^\.\//, "").replace(/^\/+/, "");

  return normalized;
}

// ---------------------------------------------------------------------------
// File protection zones (Property 23)
// ---------------------------------------------------------------------------

/**
 * Protection zone for a .forge/ state file.
 *
 * - frozen:    AI must not modify (locked specs, approved plans, config)
 * - guarded:   AI may append but not delete or overwrite existing content
 * - open:      AI may freely create and modify
 */
export type ProtectionZone = "frozen" | "guarded" | "open";

/**
 * Frozen zone patterns — files that must not be modified when locked/approved.
 *
 * These are path prefixes relative to .forge/.
 * The actual freeze depends on the file's frontmatter status field.
 */
const FROZEN_PATTERNS = ["specs/", "plans/", "config.md"] as const;

/**
 * Guarded zone patterns — files that may be appended to but not overwritten.
 */
const GUARDED_PATTERNS = [
  "progress/",
  "reviews/",
  "knowledge/instincts.md",
  "knowledge/known-failures.md",
  "knowledge/solutions/",
] as const;

/**
 * Determine the protection zone of a .forge/ state file.
 *
 * @param forgePath - Path relative to .forge/, e.g. "specs/feature/spec.md", "config.md"
 * @returns The protection zone for this file path.
 */
export function getProtectionZone(forgePath: string): ProtectionZone {
  const normalized = forgePath.replace(/^\.forge\//, "");

  for (const pattern of FROZEN_PATTERNS) {
    if (normalized === pattern || normalized.startsWith(pattern)) {
      return "frozen";
    }
  }

  for (const pattern of GUARDED_PATTERNS) {
    if (normalized === pattern || normalized.startsWith(pattern)) {
      return "guarded";
    }
  }

  return "open";
}

/**
 * Extract the `status` field value from YAML frontmatter content.
 *
 * Returns the status string if found, or null if not present.
 */
export function extractFrontmatterStatus(content: string): string | null {
  const parsed = parseFrontmatter(content);
  if (!parsed) return null;

  return extractStringField(parsed.raw, "status");
}

/**
 * Check whether a write operation to a .forge/ file should be blocked.
 *
 * A write is blocked when:
 *   - The file is in the frozen zone AND its current status is "locked" or "approved"
 *
 * Guarded zone files are not blocked (append-only enforcement requires diff analysis
 * which is handled at the hook level, not here).
 *
 * @param forgePath - Path relative to .forge/
 * @param currentContent - Current file content (to check frontmatter status)
 * @returns { blocked, reason } — whether the write should be blocked and why.
 */
export function checkWritePermission(
  forgePath: string,
  currentContent: string,
): { blocked: boolean; reason: string } {
  const zone = getProtectionZone(forgePath);

  if (zone === "guarded") {
    return { blocked: false, reason: "⚠️ 受保护区文件，仅允许追加操作" };
  }

  if (zone !== "frozen") {
    return { blocked: false, reason: "" };
  }

  const status = extractFrontmatterStatus(currentContent);

  if (status === "locked") {
    return {
      blocked: true,
      reason: `🔒 写入被阻断：${forgePath} 状态为 "locked"，属于冻结区。需要用户明确解锁后才能修改。`,
    };
  }

  if (status === "approved") {
    return {
      blocked: true,
      reason: `🔒 写入被阻断：${forgePath} 状态为 "approved"，属于冻结区。需要用户明确解锁后才能修改。`,
    };
  }

  // Frozen zone file but not yet locked/approved — allow writes (e.g. draft specs)
  return { blocked: false, reason: "" };
}

// ---------------------------------------------------------------------------
// File locking for concurrent write protection (Property 25)
// ---------------------------------------------------------------------------

/**
 * Default lock timeout in milliseconds (30 seconds).
 * A lock older than this is considered stale and can be forcibly acquired.
 */
export const DEFAULT_LOCK_TIMEOUT_MS = 30_000;

/**
 * Lock directory path relative to .forge/.
 */
export const LOCK_DIR = ".forge/.locks";

/**
 * Information stored in a lock file.
 */
export interface LockInfo {
  /** Who acquired the lock (e.g. subagent ID or task ID). */
  holder: string;
  /** ISO timestamp when the lock was acquired. */
  acquiredAt: string;
  /** The file being locked (path relative to .forge/). */
  targetFile: string;
}

/**
 * Result of a lock acquisition attempt.
 */
export interface LockResult {
  acquired: boolean;
  /** Path to the lock file (for release). */
  lockFilePath: string;
  /** If not acquired, reason why. */
  reason: string;
}

/**
 * Generate the lock file path for a given .forge/ state file.
 *
 * Converts the target file path to a flat lock file name by replacing
 * path separators with double underscores.
 *
 * Example: "progress/topic.md" → ".forge/.locks/progress__topic.md.lock"
 */
export function lockFilePath(forgePath: string): string {
  const normalized = forgePath.replace(/^\.forge\//, "");
  const flatName = normalized.replace(/\//g, "__");
  return `${LOCK_DIR}/${flatName}.lock`;
}

/**
 * Determine whether an existing lock is stale (expired).
 *
 * A lock is stale if the time elapsed since acquiredAt exceeds the timeout.
 *
 * @param lockInfo - The lock information to check.
 * @param nowMs - Current time in milliseconds (Date.now()).
 * @param timeoutMs - Lock timeout in milliseconds.
 * @returns true if the lock is stale and can be forcibly acquired.
 */
export function isLockStale(lockInfo: LockInfo, nowMs: number, timeoutMs: number): boolean {
  const acquiredMs = new Date(lockInfo.acquiredAt).getTime();
  if (Number.isNaN(acquiredMs)) {
    // Invalid timestamp — treat as stale
    return true;
  }
  return nowMs - acquiredMs > timeoutMs;
}

/**
 * Attempt to acquire a lock for a .forge/ state file.
 *
 * This is a pure function that computes the lock decision. The actual
 * file system operations (creating/reading lock files) are performed
 * by the caller (SKILL.md instructions or hook scripts).
 *
 * Rules:
 *   - If no existing lock → acquire
 *   - If existing lock is stale (older than timeout) → acquire (override)
 *   - If existing lock is held by the same holder → acquire (re-entrant)
 *   - If existing lock is fresh and held by another → reject
 *
 * @param forgePath - Target file path relative to .forge/
 * @param holder - Identity of the lock requester
 * @param existingLock - Current lock info if a lock file exists, null if no lock
 * @param nowMs - Current time in milliseconds
 * @param timeoutMs - Lock timeout in milliseconds
 */
export function tryAcquireLock(
  forgePath: string,
  holder: string,
  existingLock: LockInfo | null,
  nowMs: number,
  timeoutMs: number = DEFAULT_LOCK_TIMEOUT_MS,
): LockResult {
  const lockPath = lockFilePath(forgePath);

  // No existing lock — acquire immediately
  if (existingLock === null) {
    return { acquired: true, lockFilePath: lockPath, reason: "" };
  }

  // Re-entrant: same holder already has the lock
  if (existingLock.holder === holder) {
    return { acquired: true, lockFilePath: lockPath, reason: "" };
  }

  // Stale lock — override it
  if (isLockStale(existingLock, nowMs, timeoutMs)) {
    return { acquired: true, lockFilePath: lockPath, reason: "" };
  }

  // Fresh lock held by another — reject
  return {
    acquired: false,
    lockFilePath: lockPath,
    reason: `文件 ${forgePath} 已被 "${existingLock.holder}" 锁定（${existingLock.acquiredAt}），请稍后重试。`,
  };
}

/**
 * Create the lock info object for a successful acquisition.
 *
 * @param forgePath - Target file path relative to .forge/
 * @param holder - Identity of the lock holder
 * @param nowIso - Current time as ISO string
 */
export function createLockInfo(forgePath: string, holder: string, nowIso: string): LockInfo {
  return {
    holder,
    acquiredAt: nowIso,
    targetFile: forgePath.replace(/^\.forge\//, ""),
  };
}

/**
 * Serialize lock info to a string suitable for writing to a lock file.
 */
export function serializeLockInfo(info: LockInfo): string {
  return `holder: ${info.holder}\nacquiredAt: ${info.acquiredAt}\ntargetFile: ${info.targetFile}\n`;
}

/**
 * Parse lock info from a lock file's content.
 * Returns null if the content is not a valid lock file.
 */
export function parseLockInfo(content: string): LockInfo | null {
  const holderMatch = content.match(/^holder:\s(.+)$/m);
  const acquiredMatch = content.match(/^acquiredAt:\s(.+)$/m);
  const targetMatch = content.match(/^targetFile:\s(.+)$/m);

  if (!holderMatch || !acquiredMatch || !targetMatch) {
    return null;
  }

  return {
    holder: holderMatch[1],
    acquiredAt: acquiredMatch[1],
    targetFile: targetMatch[1],
  };
}
