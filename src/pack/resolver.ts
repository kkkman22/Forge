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

import path from "node:path";
import type { EnabledPacks } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return true if `resolved` starts with `expectedBase` (both absolute).
 *
 * Exported so the pack loader can guard `extends.*` path resolution against
 * traversal (a malicious pack.yaml setting `extends.state_machines: ../../../etc`
 * must not escape the pack's rootPath). This closes the path-traversal gap that
 * the production callers (loadStateMachineDefinitions / loadContexts /
 * loadGlossary) inherit from `loadPackRegistry`.
 */
export function isWithinBase(resolved: string, expectedBase: string): boolean {
  const normBase = expectedBase.endsWith(path.sep) ? expectedBase : expectedBase + path.sep;
  return resolved === expectedBase || resolved.startsWith(normBase);
}

/** Build candidate list: Custom first, then each pack in order. */
function buildCandidates(
  relativePath: string,
  enabledPacks: EnabledPacks,
): Array<{ path: string; layer: string }> {
  const candidates: Array<{ path: string; layer: string }> = [];

  // 1. Custom layer
  candidates.push({
    path: path.join(enabledPacks.customLayerRoot, relativePath),
    layer: "custom",
  });

  // 2. Pack entries in declaration order
  for (const entry of enabledPacks.entries) {
    candidates.push({
      path: path.join(entry.rootPath, relativePath),
      layer: `pack:${entry.name}`,
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a relative path to the first matching layer.
 *
 * Checks Custom layer first, then each enabled pack in declaration order.
 * Returns `null` if path traversal is detected.
 *
 * **Note**: This function only computes candidate paths — it does NOT
 * check whether the files actually exist on disk.
 */
export function resolvePath(
  relativePath: string,
  enabledPacks: EnabledPacks,
): { path: string; layer: string } | null {
  const candidates = buildCandidates(relativePath, enabledPacks);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate.path);

    // Determine expected base for traversal check
    let expectedBase: string;
    if (candidate.layer === "custom") {
      expectedBase = path.resolve(enabledPacks.customLayerRoot);
    } else {
      // layer is "pack:<name>"
      const packName = candidate.layer.slice(5);
      const packEntry = enabledPacks.entries.find((e) => e.name === packName);
      if (!packEntry) continue;
      expectedBase = path.resolve(packEntry.rootPath);
    }

    if (!isWithinBase(resolved, expectedBase)) {
      return null;
    }

    // Return first candidate that passes traversal check
    return { path: resolved, layer: candidate.layer };
  }

  return null;
}

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
export function resolveAllPaths(
  relativePath: string,
  enabledPacks: EnabledPacks,
): Array<{ path: string; layer: string }> {
  const candidates = buildCandidates(relativePath, enabledPacks);
  const results: Array<{ path: string; layer: string }> = [];

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate.path);

    // Determine expected base for traversal check
    let expectedBase: string;
    if (candidate.layer === "custom") {
      expectedBase = path.resolve(enabledPacks.customLayerRoot);
    } else {
      const packName = candidate.layer.slice(5);
      const packEntry = enabledPacks.entries.find((e) => e.name === packName);
      if (!packEntry) continue;
      expectedBase = path.resolve(packEntry.rootPath);
    }

    if (isWithinBase(resolved, expectedBase)) {
      results.push({ path: resolved, layer: candidate.layer });
    }
  }

  return results;
}
