/**
 * Claude Code version compatibility gate.
 *
 * Provides semver parsing, comparison, and version range checking for
 * Forge's Claude Code CLI version requirements.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.7, 1.8**
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Version range specification for Claude Code compatibility. */
export interface ClaudeVersionRange {
  /** Minimum supported Claude Code version (inclusive). */
  minimum: string;
  /** Optional maximum verified version. Higher versions produce a warning. */
  maximum?: string;
  /** Latest version that has been explicitly tested with Forge. */
  verifiedLatest: string;
}

/** Verdict of a version compatibility check. */
export type VersionVerdict = "pass" | "warn" | "fail" | "unknown";

/** Result of checking the current Claude Code version against a range. */
export interface ClaudeVersionCheck {
  /** The detected Claude Code version, or null if unavailable. */
  currentVersion: string | null;
  /** The minimum required version. */
  minimumVersion: string;
  /** The maximum verified version, if defined. */
  maximumVersion?: string;
  /** The latest version verified to work with Forge. */
  verifiedLatest: string;
  /** The compatibility verdict. */
  verdict: VersionVerdict;
  /** Human-readable explanation of the verdict. */
  reason: string;
  /** Optional hint for resolving the issue. */
  fixHint?: string;
}

// ---------------------------------------------------------------------------
// Host-aware gating (P2 zcode-p2-native-architecture)
// ---------------------------------------------------------------------------

import { getHostAdapter } from "./host/detect.js";

/**
 * Check the Claude Code version against a range, but bypass the hard `fail`
 * gate on non-Claude hosts (e.g. Zcode has no Claude CLI to version-check).
 *
 * On the Claude host this is byte-equal to {@link checkClaudeVersion}. On Zcode
 * a `fail` verdict is downgraded to an informational `warn` — the Claude semver
 * gate does not apply, but the version (if any) is still surfaced for display.
 *
 * **Validates: requirement R4-AC3.**
 */
export function checkHostVersion(
  current: string | null,
  range: ClaudeVersionRange,
): ClaudeVersionCheck {
  const result = checkClaudeVersion(current, range);
  if (result.verdict !== "fail") return result;

  // Only the Claude host applies the Claude semver gate.
  if (getHostAdapter().platform === "claude-code") return result;

  // Zcode (or any non-Claude host): downgrade fail → warn (informational).
  return {
    ...result,
    verdict: "warn",
    reason: `Host reports Claude Code ${current ?? "(unknown)"}, but the Claude semver gate is not applied on this host. Version surfaced for display only.`,
    fixHint: undefined,
  };
}

// ---------------------------------------------------------------------------
// Default range
// ---------------------------------------------------------------------------

/**
 * Default Forge version requirements.
 * Minimum 2.1.163 for Stop/SubagentStop additionalContext and session id consistency.
 */
export const FORGE_VERSION_RANGE: ClaudeVersionRange = {
  minimum: "2.1.163",
  verifiedLatest: "2.1.163",
};

// ---------------------------------------------------------------------------
// Internal: semver parsing
// ---------------------------------------------------------------------------

interface SemverParts {
  major: number;
  minor: number;
  patch: number;
}

function parseSemverParts(s: string): SemverParts | null {
  const m = s.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a version string from `claude --version` output.
 *
 * Extracts the first `X.Y.Z` semver pattern found in the input.
 * Returns null if no valid version is found.
 *
 * @param output - Raw output from `claude --version` or similar.
 * @returns The extracted version string, or null.
 */
export function parseClaudeVersion(output: string): string | null {
  if (typeof output !== "string" || output.length === 0) return null;
  const match = output.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

/**
 * Compare two semver version strings.
 *
 * Uses numeric tuple comparison (major, minor, patch), not string comparison.
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 *
 * @param a - First version string (X.Y.Z).
 * @param b - Second version string (X.Y.Z).
 * @returns -1, 0, or 1.
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemverParts(a);
  const pb = parseSemverParts(b);

  // If either can't be parsed, treat as equal (safe default)
  if (!pa || !pb) return 0;

  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
  return 0;
}

/**
 * Check whether the current Claude Code version satisfies Forge's requirements.
 *
 * @param current - The current version string, or null if unavailable.
 * @param range - The required version range.
 * @returns A detailed version check result.
 */
export function checkClaudeVersion(
  current: string | null,
  range: ClaudeVersionRange,
): ClaudeVersionCheck {
  const base: ClaudeVersionCheck = {
    currentVersion: current,
    minimumVersion: range.minimum,
    maximumVersion: range.maximum,
    verifiedLatest: range.verifiedLatest,
    verdict: "pass",
    reason: "",
    fixHint: undefined,
  };

  // Unknown version
  if (current === null) {
    return {
      ...base,
      verdict: "unknown",
      reason: `Unable to determine Claude Code version. Forge requires >= ${range.minimum}.`,
      fixHint: `Run 'claude --version' to check your CLI version. If installed, ensure it's >= ${range.minimum}.`,
    };
  }

  const cmpMin = compareSemver(current, range.minimum);

  // Below minimum
  if (cmpMin < 0) {
    return {
      ...base,
      verdict: "fail",
      reason: `Claude Code ${current} is below the minimum required version ${range.minimum}. Some Forge capabilities (Stop additionalContext, session id consistency, managed version settings) require >= ${range.minimum}.`,
      fixHint: `Update Claude Code to >= ${range.minimum} (verified latest: ${range.verifiedLatest}).`,
    };
  }

  // Above maximum (warning only)
  if (range.maximum) {
    const cmpMax = compareSemver(current, range.maximum);
    if (cmpMax > 0) {
      return {
        ...base,
        verdict: "warn",
        reason: `Claude Code ${current} is above the verified maximum ${range.maximum}. Forge may work correctly, but compatibility has not been verified. Run forge-doctor for diagnostics.`,
        fixHint: `Run 'forge-doctor' to check compatibility, or downgrade to <= ${range.maximum}.`,
      };
    }
  }

  // Pass
  return {
    ...base,
    verdict: "pass",
    reason: `Claude Code ${current} meets Forge requirements (>= ${range.minimum}).`,
  };
}
