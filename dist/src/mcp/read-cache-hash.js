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
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
// ---------------------------------------------------------------------------
// Hash computation
// ---------------------------------------------------------------------------
/**
 * Get the content hash of a file.
 *
 * For git-tracked files: uses `git hash-object` (SHA-1 blob hash).
 * For untracked files: computes SHA-256 of file content.
 *
 * Falls back to SHA-256 on any git error.
 */
export async function getFileHash(filePath) {
    // Try git hash-object first
    try {
        const gitHash = await gitHashObject(filePath);
        if (gitHash)
            return gitHash;
    }
    catch {
        // Git not available or file not in repo — fall through
    }
    // Fallback: SHA-256 of file content
    return sha256File(filePath);
}
/**
 * Compute the diff between two content versions of a file.
 *
 * For same hash → returns empty string.
 * For different hashes → returns the new content (since we can't do
 * git diff on SHA-256-only files, we return the full new content as
 * the "diff" — the caller will use this to replace the cached version).
 */
export async function getFileDiff(filePath, _oldHash, newHash) {
    // Same hash = no change
    if (_oldHash === newHash)
        return "";
    // Read current content as the "diff" replacement
    const content = await readFile(filePath, "utf-8");
    return content;
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/**
 * Run `git hash-object` on a file. Returns null if file is not
 * in a git repo or git is unavailable.
 */
function gitHashObject(filePath) {
    return new Promise((resolve) => {
        execFile("git", ["hash-object", filePath], { timeout: 5000 }, (err, stdout) => {
            if (err) {
                resolve(null);
                return;
            }
            const hash = stdout.trim();
            // git hash-object returns 40-char hex SHA-1
            resolve(/^[0-9a-f]{40}$/.test(hash) ? hash : null);
        });
    });
}
/**
 * Compute SHA-256 hex digest of a file's content.
 */
async function sha256File(filePath) {
    const content = await readFile(filePath);
    return createHash("sha256").update(content).digest("hex");
}
//# sourceMappingURL=read-cache-hash.js.map