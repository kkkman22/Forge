/**
 * Shared path validation for MCP tools.
 *
 * Provides `validateSinglePath` and `validatePaths` used by forge-read.ts
 * to prevent path traversal attacks.
 *
 * Uses `resolve()` + `relative()` to handle symlinks and edge cases
 * that `startsWith()` alone cannot catch (prefix attack).
 */
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
export declare function validateSinglePath(inputPath: string, projectRoot: string): boolean;
/**
 * Validate that all paths resolve within the project root.
 * Returns an error message if any path escapes, or null if all are safe.
 *
 * Reusable across MCP tools that read files within the project root.
 */
export declare function validatePaths(paths: string[], projectRoot: string): string | null;
