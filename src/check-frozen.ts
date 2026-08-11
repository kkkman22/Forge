/**
 * Frozen file protection — checks if a .tinkerman/ state file is in a frozen state.
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

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractFrontmatterStatus, getProtectionZone, normalizeForgePath } from "./state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Fire-and-forget notification to cmux on frozen interception (R6.1). */
function notifyFrozen(targetFile: string): void {
  try {
    const hookPath = join(__dirname, "..", "scripts", "cmux-mirror", "hook-notify.sh");
    const child = spawn("bash", [hookPath], {
      detached: true,
      stdio: "ignore",
      env: { PATH: process.env.PATH ?? "", FORGE_TASK: targetFile },
    });
    child.unref();
  } catch (_err: unknown) {
    // Best-effort — never affect exit code (R6.1)
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Statuses that indicate a file is frozen and must not be modified. */
const FROZEN_STATUSES = ["locked", "approved"];

/**
 * Source-tree files that are hard-frozen regardless of frontmatter.
 *
 * Unlike `.tinkerman/` state files (whose freeze is controlled by the `status`
 * field in their frontmatter), these files are policy-locked at the
 * repository level: any modification requires an ADR produced by
 * `/tinkerman decide`.
 *
 * Paths are matched against both the raw argv path and the
 * `.tinkerman/`-stripped form, so callers may pass either.
 *
 * **Validates: Requirement 5.10** — prompt-defense pattern library.
 */
const HARD_FROZEN_SOURCE_FILES: ReadonlyArray<string> = ["src/prompt-defense-patterns.ts"];

/**
 * Check whether the given path is in the source-tree hard-frozen list.
 *
 * Performs a suffix match against `HARD_FROZEN_SOURCE_FILES` so both
 * repository-relative and absolute paths work. The path is first
 * normalised to use forward slashes.
 */
export function isHardFrozenSourceFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  for (const protected_ of HARD_FROZEN_SOURCE_FILES) {
    if (normalized === protected_ || normalized.endsWith(`/${protected_}`)) {
      return true;
    }
  }
  return false;
}

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

  // Source-tree hard-frozen files (e.g., src/prompt-defense-patterns.ts)
  // Block regardless of frontmatter — require ADR per Requirement 5.10.
  if (isHardFrozenSourceFile(targetFile)) {
    // biome-ignore lint/suspicious/noConsole: check-frozen runs in hook context without logger
    console.log(`🔒 写入被阻断：${targetFile} 属于源代码硬冻结区（prompt defense 模式库等）。`);
    // biome-ignore lint/suspicious/noConsole: check-frozen runs in hook context without logger
    console.log(
      "修改此类文件必须通过 /tinkerman decide 产生 ADR。请参考 CONTRIBUTING.md §需要 ADR 的高敏感文件。",
    );
    notifyFrozen(targetFile);
    process.exit(1);
  }

  // Not in a frozen zone — allow
  if (!isFrozenZonePath(targetFile)) process.exit(0);

  // File doesn't exist yet — new files are always allowed
  if (!existsSync(targetFile)) process.exit(0);

  const content = readFileSync(targetFile, "utf-8");
  const status = extractStatus(content);

  if (status && FROZEN_STATUSES.includes(status)) {
    // biome-ignore lint/suspicious/noConsole: check-frozen runs in hook context without logger
    console.log(`🔒 写入被阻断：${targetFile} 状态为 "${status}"，属于冻结区。`);
    // biome-ignore lint/suspicious/noConsole: check-frozen runs in hook context without logger
    console.log("需要用户明确解锁后才能修改。请勿重试此写入操作。");
    notifyFrozen(targetFile);
    process.exit(1);
  }

  process.exit(0);
}

/**
 * Determine whether the current module is the Node CLI entry point.
 *
 * The raw comparison `import.meta.url === \`file://${process.argv[1]}\`` fails
 * on Windows: drive letters, backslash separators, and URL-encoding
 * differences prevent equality, so the CLI hook silently skips `main()`.
 *
 * Comparison is done via normalised plain path strings rather than
 * platform-dependent `path.resolve()` / `pathToFileURL()`, which on a POSIX
 * process mis-handle a Windows argv (treating `C:\...` as a relative filename
 * and URL-encoding the backslashes). String normalisation is stable across
 * platforms:
 *   1. strip the `file://` host prefix from `import.meta.url`;
 *   2. convert argv backslashes to forward slashes (the Windows separator);
 *   3. Windows-style paths: strip the drive letter and compare
 *      case-insensitively (Windows paths are case-insensitive).
 *
 * @param importMetaUrl  The value of `import.meta.url`.
 * @param argv1          The value of `process.argv[1]`, or `undefined`.
 * @returns `true` iff `argv1` refers to the same file as `importMetaUrl`.
 *
 * **Validates: Requirement REQ-05** — cross-platform entry-point detection.
 */
export function isMainEntry(importMetaUrl: string, argv1: string | undefined): boolean {
  if (!argv1) return false;
  // argv backslashes → forward slashes (Windows separator).
  const argvPath = argv1.replace(/\\/g, "/");
  // Strip the "file://" two-slash prefix, then decode percent-encoding.
  // import.meta.url percent-encodes spaces/non-ASCII (e.g. "/Users/my%20dir/...")
  // while process.argv[1] carries the raw path ("/Users/my dir/..."), so a raw
  // comparison fails on encoded segments. decodeURIComponent closes that gap.
  const urlPath = decodeURIComponent(importMetaUrl.replace(/^file:\/\//, ""));
  // Windows-style paths carry a drive letter (X:). Normalise both sides to
  // a drive-less, lowercase, leading-slash-stripped form so that
  // "/C:/Users/..." (from file URL) matches "C:/Users/..." (from argv) and
  // Windows case-insensitivity is respected.
  const norm = (p: string): string => {
    // strip an optional leading slash + drive letter, then any remaining
    // leading slash, then lowercase (Windows paths are case-insensitive).
    const withoutDrive = p.replace(/^\/?[A-Za-z]:/, "");
    return withoutDrive.replace(/^\//, "").toLowerCase();
  };
  const isWindowsStyle = /^[A-Za-z]:\//.test(argvPath) || /\/[A-Za-z]:\//.test(urlPath);
  if (isWindowsStyle) {
    return norm(urlPath) === norm(argvPath);
  }
  // POSIX: compare absolute paths directly.
  return urlPath === argvPath;
}

// Only run the CLI side-effects when this module is the entry point.
// When imported (e.g. by unit tests), skip `main()` to avoid calling
// `process.exit()` on import.
if (isMainEntry(import.meta.url, process.argv[1])) {
  main();
}
