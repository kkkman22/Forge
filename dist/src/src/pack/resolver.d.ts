/**
 * Layer-aware path resolver for the pack system.
 *
 * Resolves a relative path across the Custom layer and enabled packs,
 * returning the first hit (resolvePath) or all hits (resolveAllPaths).
 * Includes path traversal protection to prevent `../../etc/passwd` attacks.
 *
 * Both functions are synchronous (no IO) — they compute candidate paths,
 * not verify file existence.
 */
import type { EnabledPacks } from "./types.js";
/**
 * Resolve a relative path to the first matching layer.
 *
 * Checks Custom layer first, then each enabled pack in declaration order.
 * Returns `null` if path traversal is detected.
 *
 * **Note**: This function only computes candidate paths — it does NOT
 * check whether the files actually exist on disk.
 */
export declare function resolvePath(relativePath: string, enabledPacks: EnabledPacks): {
    path: string;
    layer: string;
} | null;
/**
 * Resolve a relative path to ALL matching layers.
 *
 * Returns every candidate (Custom + all packs) that passes path traversal
 * protection. Useful for union scenarios like banned-patterns where all
 * layers must be consulted.
 *
 * **Note**: This function only computes candidate paths — it does NOT
 * check whether the files actually exist on disk.
 */
export declare function resolveAllPaths(relativePath: string, enabledPacks: EnabledPacks): Array<{
    path: string;
    layer: string;
}>;
