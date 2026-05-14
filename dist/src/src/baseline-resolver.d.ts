/**
 * Baseline resolver for Forge_Verify.
 *
 * 4-level priority chain for resolving the baseline reference:
 *   1. Explicit --baseline <git-ref> flag
 *   2. merge-base(origin/main)
 *   3. HEAD^ (parent commit)
 *   4. Last treatment snapshot
 *   — All fail → { strategy: "none" }
 *
 * **Validates: Requirement R1.10**
 */
/** Result of baseline resolution. */
export interface BaselineResolution {
    /** The resolved git ref, or null if unavailable. */
    ref: string | null;
    /** The strategy used to resolve the baseline. */
    strategy: "explicit" | "merge-base" | "parent" | "last-treatment" | "none";
    /** Path to snapshot dir when strategy is "last-treatment". */
    snapshotDir?: string;
}
/** Options for baseline resolution. */
export interface ResolveOptions {
    /** Working directory for git commands. Defaults to process.cwd(). */
    cwd?: string;
    /** Path to .forge directory. Defaults to <cwd>/.forge. */
    forgeDir?: string;
}
/**
 * Resolve a baseline reference using the 4-level priority chain.
 *
 * Falls through each level on failure. Returns `{ strategy: "none" }`
 * if all levels fail.
 */
export declare function resolveBaseline(topic: string, explicit?: string, options?: ResolveOptions): Promise<BaselineResolution>;
