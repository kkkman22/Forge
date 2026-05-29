/**
 * Read cache index for forge_read_cached MCP tool.
 *
 * Maintains a session-level index of previously-read files (path → git hash +
 * content hash + line range) to avoid re-reading unchanged content into the
 * context window.
 *
 * Layer 1 of the five-layer context explosion defense.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CacheEntry {
  path: string;
  gitHash: string; // git blob hash or SHA-256 for untracked files
  contentHash: string; // SHA-256 of the read content
  charCount: number;
  lineRange?: [number, number]; // [start, end] inclusive
  timestamp: number;
}

export interface ReadCacheIndex {
  sessionId: string;
  entries: Record<string, CacheEntry>;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Create a new empty cache index for the given session.
 */
export function createIndex(sessionId: string): ReadCacheIndex {
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
export function lookup(
  index: ReadCacheIndex,
  path: string,
  startLine?: number,
  endLine?: number,
): CacheEntry | null {
  const entry = index.entries[path];
  if (!entry) return null;

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
export function update(
  index: ReadCacheIndex,
  path: string,
  gitHash: string,
  contentHash: string,
  charCount: number,
  lineRange?: [number, number],
): CacheEntry {
  const entry: CacheEntry = {
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
