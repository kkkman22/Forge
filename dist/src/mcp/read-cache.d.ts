/**
 * Read cache index for forge_read_cached MCP tool.
 *
 * Maintains a session-level index of previously-read files (path → git hash +
 * content hash + line range) to avoid re-reading unchanged content into the
 * context window. Persists to ${TMPDIR}/forge-read-cache-<session>.json.
 *
 * Layer 1 of the five-layer context explosion defense.
 */
export interface CacheEntry {
    path: string;
    gitHash: string;
    contentHash: string;
    charCount: number;
    lineRange?: [number, number];
    timestamp: number;
}
export interface ReadCacheIndex {
    sessionId: string;
    entries: Record<string, CacheEntry>;
}
/**
 * Load a cache index from disk, or create empty if not found.
 */
export declare function loadOrCreateIndex(sessionId: string): Promise<ReadCacheIndex>;
/**
 * Persist the cache index to disk. Fail-open: errors are logged, not thrown.
 */
export declare function persistIndex(index: ReadCacheIndex): Promise<void>;
/**
 * Create a new empty cache index for the given session.
 */
export declare function createIndex(sessionId: string): ReadCacheIndex;
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
export declare function lookup(index: ReadCacheIndex, path: string, startLine?: number, endLine?: number): CacheEntry | null;
/**
 * Insert or update a cache entry. Returns the created/updated entry.
 */
export declare function update(index: ReadCacheIndex, path: string, gitHash: string, contentHash: string, charCount: number, lineRange?: [number, number]): CacheEntry;
