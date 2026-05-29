import type { DiagnosticRecord } from "./types.js";
/**
 * Check root directory first-level .md files against a whitelist.
 * - Non-recursive: only top-level files are scanned.
 * - Hidden files (starting with ".") are ignored.
 * - Symlinks are not followed.
 * - LICENSE/LICENSE.md mutual exclusion: both present = critical error;
 *   either present counts as a whitelist hit for "LICENSE.md".
 */
export declare function checkRootWhitelist(rootDir: string, whitelist: readonly string[]): DiagnosticRecord[];
