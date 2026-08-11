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

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

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

const GIT_TIMEOUT_MS = 10_000;

/**
 * Resolve a baseline reference using the 4-level priority chain.
 *
 * Falls through each level on failure. Returns `{ strategy: "none" }`
 * if all levels fail.
 */
export async function resolveBaseline(
  topic: string,
  explicit?: string,
  options: ResolveOptions = {},
): Promise<BaselineResolution> {
  const cwd = options.cwd ?? process.cwd();
  const forgeDir = options.forgeDir ?? join(cwd, ".tinkerman");

  // Level 1: Explicit --baseline <git-ref>
  if (explicit) {
    const ref = tryGitResolve(explicit, cwd);
    if (ref) return { ref, strategy: "explicit" };
  }

  // Level 2: merge-base(origin/main)
  const mergeBase = tryMergeBase(cwd);
  if (mergeBase) return { ref: mergeBase, strategy: "merge-base" };

  // Level 3: HEAD^ (parent commit)
  const parent = tryParent(cwd);
  if (parent) return { ref: parent, strategy: "parent" };

  // Level 4: Last treatment snapshot
  const snapshot = tryLastSnapshot(topic, forgeDir);
  if (snapshot) return { ref: null, strategy: "last-treatment", snapshotDir: snapshot };

  return { ref: null, strategy: "none" };
}

function tryGitResolve(ref: string, cwd: string): string | null {
  // Validate ref to prevent injection via execFileSync args
  if (!/^[\w./^-]+$/.test(ref)) return null;
  try {
    const result = execFileSync("git", ["rev-parse", ref], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return result.length > 0 ? result : null;
  } catch (_err: unknown) {
    return null;
  }
}

function tryMergeBase(cwd: string): string | null {
  try {
    // Check if remote origin exists
    execFileSync("git", ["remote", "get-url", "origin"], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const result = execFileSync("git", ["merge-base", "HEAD", "origin/main"], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return result.length > 0 ? result : null;
  } catch (_err: unknown) {
    return null;
  }
}

function tryParent(cwd: string): string | null {
  try {
    const result = execFileSync("git", ["rev-parse", "HEAD^"], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return result.length > 0 ? result : null;
  } catch (_err: unknown) {
    return null;
  }
}

function tryLastSnapshot(topic: string, forgeDir: string): string | null {
  const treatmentDir = join(forgeDir, "findings", topic, "verify-this", "treatment");
  if (!existsSync(treatmentDir)) return null;

  try {
    const files = readdirSync(treatmentDir);
    return files.length > 0 ? treatmentDir : null;
  } catch (_err: unknown) {
    return null;
  }
}
