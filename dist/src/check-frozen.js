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
/**
 * Source-tree files that are hard-frozen regardless of frontmatter.
 *
 * Unlike `.forge/` state files (whose freeze is controlled by the `status`
 * field in their frontmatter), these files are policy-locked at the
 * repository level: any modification requires an ADR produced by
 * `/forge decide`.
 *
 * Paths are matched against both the raw argv path and the
 * `.forge/`-stripped form, so callers may pass either.
 *
 * **Validates: Requirement 5.10** — prompt-defense pattern library.
 */
const HARD_FROZEN_SOURCE_FILES = [
    "src/prompt-defense-patterns.ts",
];
/**
 * Check whether the given path is in the source-tree hard-frozen list.
 *
 * Performs a suffix match against `HARD_FROZEN_SOURCE_FILES` so both
 * repository-relative and absolute paths work. The path is first
 * normalised to use forward slashes.
 */
export function isHardFrozenSourceFile(filePath) {
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
export function isFrozenZonePath(filePath) {
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
export function extractStatus(content) {
    return extractFrontmatterStatus(content);
}
// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
/**
 * Main CLI function — reads a file path from argv, checks frozen status,
 * and exits with the appropriate code.
 */
function main() {
    const targetFile = process.argv[2];
    // No file argument — nothing to check
    if (!targetFile)
        process.exit(0);
    // Source-tree hard-frozen files (e.g., src/prompt-defense-patterns.ts)
    // Block regardless of frontmatter — require ADR per Requirement 5.10.
    if (isHardFrozenSourceFile(targetFile)) {
        console.log(`🔒 写入被阻断：${targetFile} 属于源代码硬冻结区（prompt defense 模式库等）。`);
        console.log("修改此类文件必须通过 /forge decide 产生 ADR。请参考 CONTRIBUTING.md §需要 ADR 的高敏感文件。");
        process.exit(1);
    }
    // Not in a frozen zone — allow
    if (!isFrozenZonePath(targetFile))
        process.exit(0);
    // File doesn't exist yet — new files are always allowed
    if (!existsSync(targetFile))
        process.exit(0);
    const content = readFileSync(targetFile, "utf-8");
    const status = extractStatus(content);
    if (status && FROZEN_STATUSES.includes(status)) {
        console.log(`🔒 写入被阻断：${targetFile} 状态为 "${status}"，属于冻结区。`);
        console.log("需要用户明确解锁后才能修改。请勿重试此写入操作。");
        process.exit(1);
    }
    process.exit(0);
}
// Only run the CLI side-effects when this module is the entry point.
// When imported (e.g. by unit tests), skip `main()` to avoid calling
// `process.exit()` on import.
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
//# sourceMappingURL=check-frozen.js.map