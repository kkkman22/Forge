/**
 * Path equivalence guard — canonicalization and Bash path extraction.
 *
 * Provides safe path canonicalization for ~, $HOME, ${HOME}, relative paths,
 * double slashes, and .. traversal. Also extracts path-like tokens from
 * Bash commands without executing any shell.
 *
 * Security: only HOME and PWD are whitelisted for variable expansion.
 * High-risk frozen-zone paths that cannot be resolved fail closed.
 *
 * **Validates: Requirements 5.1, 5.2, 5.5, 5.6, 5.7**
 */

import * as nodePath from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for path canonicalization. */
export interface PathCanonicalizeOptions {
  /** Current working directory for resolving relative paths. */
  cwd: string;
  /** Home directory for expanding ~ and $HOME. */
  homeDir: string;
  /** Optional symlink resolver (inject for testing). */
  resolveSymlink?: (path: string) => string | null;
}

/** Result of canonicalizing a path expression. */
export interface CanonicalPathResult {
  /** The original raw input. */
  raw: string;
  /** The normalized/expanded path. */
  normalized: string;
  /** Real path if symlink resolution was applied. */
  realpath?: string;
  /** True if the path contains a high-risk frozen-zone signal but can't be fully resolved. */
  highRiskUnresolved: boolean;
}

// ---------------------------------------------------------------------------
// Frozen-zone signal patterns
// ---------------------------------------------------------------------------

const HIGH_RISK_PATTERNS = [".tinkerman/config.md", ".tinkerman/specs/", ".tinkerman/plans/"];

function containsHighRiskSignal(path: string): boolean {
  return HIGH_RISK_PATTERNS.some((pattern) => path.includes(pattern));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Canonicalize a path expression, expanding ~, $HOME, ${HOME}, and normalizing.
 *
 * Security: only HOME is whitelisted for variable expansion. No shell execution.
 * If a path contains a frozen-zone signal but cannot be fully resolved,
 * highRiskUnresolved is set to true (fail-closed signal).
 *
 * @param raw - The raw path expression.
 * @param options - Canonicalization options.
 * @returns A canonical result with normalized path and risk flags.
 */
export function canonicalizePathExpression(
  raw: string,
  options: PathCanonicalizeOptions,
): CanonicalPathResult {
  let expanded = raw;

  // 1. Expand ~ → homeDir
  if (expanded.startsWith("~/")) {
    expanded = options.homeDir + expanded.slice(1);
  } else if (expanded === "~") {
    expanded = options.homeDir;
  }

  // 2. Expand $HOME/ and ${HOME}/ → homeDir (whitelist only)
  expanded = expanded.replace(/^\$HOME\//, `${options.homeDir}/`);
  expanded = expanded.replace(/^\$\{HOME\}\//, `${options.homeDir}/`);

  // 3. Detect high-risk unresolved paths
  // If the path still contains variable-like syntax ($...) and a frozen-zone signal
  const hasUnresolvedVar = /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/.test(expanded) && expanded !== raw; // Only if we did some expansion but vars remain
  const hasHighRisk = containsHighRiskSignal(raw);
  const highRiskUnresolved = hasUnresolvedVar && hasHighRisk;

  // Also check if the raw path had quotes wrapping unresolved vars with high-risk signals
  const quotedUnresolved = /^['"].*\$\{?[A-Za-z_].*['"]/.test(raw) && hasHighRisk;
  const finalHighRisk = highRiskUnresolved || quotedUnresolved;

  // 4. Normalize: collapse //, resolve ..
  let normalized: string;
  if (nodePath.isAbsolute(expanded)) {
    normalized = nodePath.posix.normalize(expanded);
  } else {
    normalized = nodePath.posix.normalize(nodePath.posix.join(options.cwd, expanded));
  }

  // 5. Optional symlink resolution
  let realpath: string | undefined;
  if (options.resolveSymlink) {
    const resolved = options.resolveSymlink(normalized);
    if (resolved) realpath = resolved;
  }

  return {
    raw,
    normalized,
    realpath,
    highRiskUnresolved: finalHighRisk,
  };
}

/**
 * Extract path-like expressions from a Bash command string.
 *
 * Uses regex-based extraction — NO shell execution. Captures:
 * - Tilde paths: ~/...
 * - Variable paths: $HOME/..., ${HOME}/...
 * - Quoted paths: "..." or '...'
 * - Subshell literal paths: $(...) and `...`
 *
 * @param command - A Bash command string.
 * @returns Array of extracted path-like strings.
 */
export function extractPathExpressionsFromBash(command: string): string[] {
  const paths: string[] = [];

  // 1. Tilde paths: ~/...
  const tildeMatches = command.matchAll(/~\/[^\s'"`;|$(){}<>]*/g);
  for (const m of tildeMatches) {
    paths.push(m[0]);
  }

  // 2. $HOME/... and ${HOME}/... paths
  const varMatches = command.matchAll(/\$(?:\{HOME\}|HOME)\/[^\s'"`;|$(){}<>]*/g);
  for (const m of varMatches) {
    paths.push(m[0]);
  }

  // 3. Quoted strings containing path-like content
  const quotedMatches = command.matchAll(/["']([^"']*\.[a-zA-Z0-9_/][^"']*)["']/g);
  for (const m of quotedMatches) {
    if (m[1] && m[1].length > 1) {
      paths.push(m[1]);
    }
  }

  // 4. Subshell/backtick content (extract literal paths only, no execution)
  const subshellMatches = command.matchAll(/\$\(([^)]+)\)/g);
  for (const m of subshellMatches) {
    // Extract path-like tokens from subshell content
    const inner = m[1];
    const innerPaths = inner.match(/[~/]?\S*\.\S+/g);
    if (innerPaths) {
      paths.push(...innerPaths);
    }
  }

  const backtickMatches = command.matchAll(/`([^`]+)`/g);
  for (const m of backtickMatches) {
    const inner = m[1];
    const innerPaths = inner.match(/[~/]?\S*\.\S+/g);
    if (innerPaths) {
      paths.push(...innerPaths);
    }
  }

  return paths;
}

/**
 * Check if two canonical path results are equivalent.
 *
 * Compares normalized paths (and realpath if available).
 *
 * @param a - First canonical result.
 * @param b - Second canonical result.
 * @returns True if the paths resolve to the same location.
 */
export function pathsEquivalent(a: CanonicalPathResult, b: CanonicalPathResult): boolean {
  if (a.normalized === b.normalized) return true;
  if (a.realpath && b.realpath && a.realpath === b.realpath) return true;
  return false;
}
