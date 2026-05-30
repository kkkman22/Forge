/**
 * Read cache index for forge_read_cached MCP tool.
 *
 * Maintains a session-level index of previously-read files (path → git hash +
 * content hash + line range) to avoid re-reading unchanged content into the
 * context window. Persists to ${TMPDIR}/forge-read-cache-<session>.json.
 *
 * Layer 1 of the five-layer context explosion defense.
 */
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
function cacheFilePath(sessionId) {
    return join(tmpdir(), `forge-read-cache-${sessionId}.json`);
}
/**
 * Load a cache index from disk, or create empty if not found.
 */
export async function loadOrCreateIndex(sessionId) {
    const filePath = cacheFilePath(sessionId);
    try {
        const raw = await readFile(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed.sessionId === sessionId && typeof parsed.entries === "object") {
            return parsed;
        }
    }
    catch {
        // File missing or corrupted — create fresh
    }
    return { sessionId, entries: {} };
}
/**
 * Persist the cache index to disk. Fail-open: errors are logged, not thrown.
 */
export async function persistIndex(index) {
    try {
        const filePath = cacheFilePath(index.sessionId);
        await writeFile(filePath, JSON.stringify(index));
    }
    catch {
        // Fail-open: cache persistence failure should not block reads
    }
}
// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------
/**
 * Create a new empty cache index for the given session.
 */
export function createIndex(sessionId) {
    return { sessionId, entries: {} };
}
/**
 * Look up a cached entry by path and optional line range.
 *
 * Returns null if no entry exists, or if the stored line range doesn't
 * contain the requested range.
 *
 * Line range semantics:
 * - No lineRange stored → full file read → any sub-range is a hit
 * - lineRange stored → hit only if stored range fully contains requested range
 */
export function lookup(index, path, startLine, endLine) {
    const entry = index.entries[path];
    if (!entry)
        return null;
    // No range requested — direct hit
    if (startLine === undefined && endLine === undefined) {
        return entry;
    }
    // Range requested but entry has no range — entry covers full file, any sub-range matches
    if (!entry.lineRange) {
        return entry;
    }
    // Both have ranges — check containment
    const [cachedStart, cachedEnd] = entry.lineRange;
    const reqStart = startLine ?? 1;
    const reqEnd = endLine ?? Number.MAX_SAFE_INTEGER;
    if (reqStart >= cachedStart && reqEnd <= cachedEnd) {
        return entry;
    }
    return null;
}
/**
 * Insert or update a cache entry. Returns the created/updated entry.
 */
export function update(index, path, gitHash, contentHash, charCount, lineRange) {
    const entry = {
        path,
        gitHash,
        contentHash,
        charCount,
        ...(lineRange ? { lineRange } : {}),
        timestamp: Date.now(),
    };
    index.entries[path] = entry;
    return entry;
}
//# sourceMappingURL=read-cache.js.map