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
export function validateStateFile(file) {
    const errors = [];
    // Check 1: File extension must be .md
    if (!file.path.endsWith(VALID_EXTENSION)) {
        const ext = file.path.includes(".") ? file.path.slice(file.path.lastIndexOf(".")) : "(none)";
        errors.push(`文件扩展名不正确：${ext}，应为 ${VALID_EXTENSION}`);
    }
    // Check 2: Content must have valid YAML frontmatter
    const trimmedContent = file.content.trimStart();
    if (!trimmedContent.startsWith("---")) {
        errors.push('缺少 YAML frontmatter：文件内容应以 "---" 开头');
    }
    else if (parseFrontmatter(file.content) === null) {
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
export function hasMarkdownExtension(filePath) {
    return filePath.endsWith(VALID_EXTENSION);
}
/**
 * Check if content has valid YAML frontmatter.
 *
 * YAML frontmatter is a block delimited by "---" at the start and end,
 * appearing at the very beginning of the file content.
 */
export function hasYamlFrontmatter(content) {
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
export function normalizeForgePath(inputPath) {
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
/**
 * Frozen zone patterns — files that must not be modified when locked/approved.
 *
 * These are path prefixes relative to .forge/.
 * The actual freeze depends on the file's frontmatter status field.
 */
const FROZEN_PATTERNS = ["specs/", "plans/", "config.md"];
/**
 * Guarded zone patterns — files that may be appended to but not overwritten.
 */
const GUARDED_PATTERNS = [
    "progress/",
    "reviews/",
    "knowledge/instincts.md",
    "knowledge/known-failures.md",
    "knowledge/solutions/",
];
/**
 * Determine the protection zone of a .forge/ state file.
 *
 * @param forgePath - Path relative to .forge/, e.g. "specs/feature/spec.md", "config.md"
 * @returns The protection zone for this file path.
 */
export function getProtectionZone(forgePath) {
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
export function extractFrontmatterStatus(content) {
    const parsed = parseFrontmatter(content);
    if (!parsed)
        return null;
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
export function checkWritePermission(forgePath, currentContent) {
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
 * Generate the lock file path for a given .forge/ state file.
 *
 * Converts the target file path to a flat lock file name by replacing
 * path separators with double underscores.
 *
 * Example: "progress/topic.md" → ".forge/.locks/progress__topic.md.lock"
 */
export function lockFilePath(forgePath) {
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
export function isLockStale(lockInfo, nowMs, timeoutMs) {
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
export function tryAcquireLock(forgePath, holder, existingLock, nowMs, timeoutMs = DEFAULT_LOCK_TIMEOUT_MS) {
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
export function createLockInfo(forgePath, holder, nowIso) {
    if (holder.includes("\n")) {
        throw new Error(`Lock holder must not contain newlines: "${holder}"`);
    }
    return {
        holder,
        acquiredAt: nowIso,
        targetFile: forgePath.replace(/^\.forge\//, ""),
    };
}
/**
 * Serialize lock info to a string suitable for writing to a lock file.
 */
export function serializeLockInfo(info) {
    return `holder: ${info.holder}\nacquiredAt: ${info.acquiredAt}\ntargetFile: ${info.targetFile}\n`;
}
/**
 * Parse lock info from a lock file's content.
 * Returns null if the content is not a valid lock file.
 */
export function parseLockInfo(content) {
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
export function parseStatusEntries(content) {
    const fm = parseFrontmatter(content);
    if (!fm)
        return [];
    // Multi-task format: detect "tasks:" header in frontmatter
    const tasksHeader = /^tasks:\s*$/m.test(fm.raw);
    if (tasksHeader) {
        return parseTasksBlock(fm.raw);
    }
    // Legacy single-task format: current_task scalar
    const currentTask = extractStringField(fm.raw, "current_task");
    if (currentTask) {
        return [
            {
                taskName: currentTask,
                tier: extractStringField(fm.raw, "tier") ?? "",
                phase: extractStringField(fm.raw, "phase") ?? "",
                updated: extractStringField(fm.raw, "updated") ?? "",
            },
        ];
    }
    return [];
}
/**
 * Parse a multi-task YAML block from raw frontmatter text.
 *
 * Each task entry follows this indented pattern:
 * ```
 * tasks:
 *   - task: "name"
 *     tier: "standard"
 *     phase: "build"
 *     worktree: "optional"
 *     updated: "2026-04-29"
 * ```
 */
function parseTasksBlock(raw) {
    const entries = [];
    const lines = raw.split("\n");
    let inTasks = false;
    let current = null;
    for (const line of lines) {
        if (/^tasks:\s*$/.test(line)) {
            inTasks = true;
            continue;
        }
        if (!inTasks)
            continue;
        // New task entry: "  - task: \"name\""
        const taskMatch = line.match(/^\s+- task: "([^"]*)"$/);
        if (taskMatch) {
            if (current && isCompleteEntry(current)) {
                entries.push(current);
            }
            current = { taskName: taskMatch[1] };
            continue;
        }
        // Task field: "    tier: \"standard\""
        const fieldMatch = line.match(/^\s+(\w+): "([^"]*)"$/);
        if (fieldMatch && current) {
            const [, key, value] = fieldMatch;
            if (key === "tier") {
                current.tier = value;
            }
            else if (key === "phase") {
                current.phase = value;
            }
            else if (key === "updated") {
                current.updated = value;
            }
            else if (key === "worktree" && value) {
                current.worktree = value;
            }
        }
        // Empty line or end of tasks block
        if (line.trim() === "" && current) {
            if (isCompleteEntry(current))
                entries.push(current);
            current = null;
            inTasks = false;
        }
    }
    // Flush last entry
    if (current && isCompleteEntry(current)) {
        entries.push(current);
    }
    return entries;
}
function isCompleteEntry(entry) {
    return (typeof entry.taskName === "string" &&
        typeof entry.tier === "string" &&
        typeof entry.phase === "string" &&
        typeof entry.updated === "string");
}
export function serializeStatusEntries(entries) {
    const lines = ["---", "tasks:"];
    for (const entry of entries) {
        lines.push(`  - task: "${entry.taskName}"`);
        lines.push(`    tier: "${entry.tier}"`);
        lines.push(`    phase: "${entry.phase}"`);
        if (entry.worktree) {
            lines.push(`    worktree: "${entry.worktree}"`);
        }
        lines.push(`    updated: "${entry.updated}"`);
    }
    lines.push("---", "");
    lines.push("# Project Status", "");
    lines.push(`${entries.length} active task${entries.length !== 1 ? "s" : ""}.`);
    return lines.join("\n");
}
export function upsertTaskEntry(entries, newEntry) {
    const idx = entries.findIndex((e) => e.taskName === newEntry.taskName);
    if (idx >= 0) {
        const updated = [...entries];
        updated[idx] = newEntry;
        return updated;
    }
    return [...entries, newEntry];
}
export function removeTaskEntry(entries, taskName) {
    return entries.filter((e) => e.taskName !== taskName);
}
/** Check whether a task name already exists in the entries list. */
export function hasTaskName(entries, taskName) {
    return entries.some((e) => e.taskName === taskName);
}
//# sourceMappingURL=state.js.map