/**
 * @deprecated Superseded by code-review-graph (CRG) code knowledge graph.
 * This module is retained for backward compatibility.
 *
 * File hash and diff computation for forge_read_cached.
 *
 * Uses `git hash-object` for tracked files, falls back to SHA-256
 * for untracked/non-git files.
 *
 * Layer 1 of the five-layer context explosion defense.
 */
/**
 * Get the content hash of a file.
 *
 * For git-tracked files: uses `git hash-object` (SHA-1 blob hash).
 * For untracked files: computes SHA-256 of file content.
 *
 * Falls back to SHA-256 on any git error.
 */
export declare function getFileHash(filePath: string): Promise<string>;
/**
 * Compute the diff between two content versions of a file.
 *
 * For same hash → returns empty string.
 * For different hashes → returns the new content (since we can't do
 * git diff on SHA-256-only files, we return the full new content as
 * the "diff" — the caller will use this to replace the cached version).
 */
export declare function getFileDiff(filePath: string, _oldHash: string, newHash: string): Promise<string>;
