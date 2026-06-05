/**
 * Shared path validation for MCP tools.
 *
 * Provides `validateSinglePath` and `validatePaths` used by forge-read.ts
 * and forge-read-cached.ts to prevent path traversal attacks.
 *
 * Uses `resolve()` + `relative()` to handle symlinks and edge cases
 * that `startsWith()` alone cannot catch (prefix attack).
 */
import { relative, resolve } from "node:path";
/**
 * Validate that a single path resolves within the project root.
 *
 * Uses the `relative()` approach:
 *   - If the relative path from root to resolved starts with "..", it escapes.
 *   - If the resolved path doesn't start with the resolved root, it's outside.
 *
 * This handles the prefix attack that `startsWith()` alone misses:
 *   - root="/home/user/proj", attack="../project2/file" → "/home/user/project2/file"
 *   - startsWith("/home/user/proj") → TRUE (wrong!)
 *   - relative → "project2/file" → doesn't start with ".." but resolved doesn't
 *     start with resolvedRoot → caught by second check
 *
 * @param inputPath - The path to validate (absolute or relative to projectRoot)
 * @param projectRoot - The project root directory
 * @returns true if path is within project root, false otherwise
 */
export function validateSinglePath(inputPath, projectRoot) {
    const resolvedRoot = resolve(projectRoot);
    const resolved = resolve(projectRoot, inputPath);
    const rel = relative(resolvedRoot, resolved);
    // Path escapes if relative path goes up (starts with ..)
    // or if resolved doesn't start with the resolved root (handles edge cases)
    if (rel.startsWith("..")) {
        return false;
    }
    // Empty relative path means inputPath == projectRoot (valid)
    if (rel === "") {
        return true;
    }
    // Final check: resolved must be under resolvedRoot
    return resolved.startsWith(`${resolvedRoot}/`) || resolved === resolvedRoot;
}
/**
 * Validate that all paths resolve within the project root.
 * Returns an error message if any path escapes, or null if all are safe.
 *
 * Reusable by both forge-read.ts and forge-read-cached.ts.
 */
export function validatePaths(paths, projectRoot) {
    for (const p of paths) {
        if (!validateSinglePath(p, projectRoot)) {
            return `Path escapes project root: ${p}`;
        }
    }
    return null;
}
//# sourceMappingURL=path-validator.js.map