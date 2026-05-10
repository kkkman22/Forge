/**
 * Pack loader - scans packs/<name>/pack.yaml and builds an in-memory PackRegistry.
 *
 * Pure function with injected FileSystem for testability. Failed packs go into
 * warnings, never throw (honors Zero_Pack_Invariant).
 *
 * Validates: R1.1-1.6 Pack discovery and manifest parsing
 */
import type { FileSystem, PackRegistry } from "./types.js";
/**
 * Validate a parsed manifest has all required fields with correct types.
 * Returns an array of error strings (empty = valid).
 */
export declare function validateManifest(raw: Record<string, unknown>): string[];
/**
 * Scan packs/<name>/pack.yaml and build an in-memory PackRegistry.
 *
 * @param reposRoot - Absolute path to repository root
 * @param fs - Injected filesystem interface
 * @returns PackRegistry with discovered packs and warnings
 *
 * @example
 * ```ts
 * const registry = await loadPackRegistry("/my/repo", realFs);
 * for (const [name, entry] of registry.packs) {
 *   console.log(name, entry.displayName);
 * }
 * ```
 */
export declare function loadPackRegistry(reposRoot: string, fs: FileSystem): Promise<PackRegistry>;
