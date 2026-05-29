/**
 * Phased Sandbox Implementation — Phase 1: Declarative Configuration.
 *
 * Provides a declarative .forge/sandbox.json config format with pure function
 * policy checks. Phase 1 is advisory only (no enforcement).
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 */

import { existsSync, readFileSync } from "node:fs";
import * as nodePath from "node:path";
import { minimatch } from "minimatch";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Sandbox configuration for Phase 1 declarative sandbox.
 *
 * Format: .forge/sandbox.json
 */
export interface SandboxConfig {
  version: 1;
  profile: string;
  filesystem: {
    read: string[];
    write: string[];
    deny: string[];
  };
  network: {
    allow: string[];
    deny: string[];
  };
  commands: {
    allow: string[];
    deny: string[];
  };
}

/**
 * Result of a sandbox policy check.
 */
export interface SandboxCheckResult {
  allowed: boolean;
  reason: string;
  matchedRule?: string;
}

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

/**
 * Default sandbox configuration: everything allowed.
 * Used when .forge/sandbox.json does not exist or is malformed.
 */
export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  version: 1,
  profile: "default",
  filesystem: {
    read: ["**"],
    write: ["**"],
    deny: [],
  },
  network: {
    allow: ["*"],
    deny: [],
  },
  commands: {
    allow: ["*"],
    deny: [],
  },
};

// ---------------------------------------------------------------------------
// Task 1 stubs — will be implemented in Tasks 2-4
// ---------------------------------------------------------------------------

/**
 * Check whether a file path is permitted for the given operation.
 *
 * Matching logic:
 *   1. Check deny list -> hit means allowed: false (highest priority)
 *   2. Check allow list (read or write based on operation) -> hit means allowed: true
 *   3. No rule matched -> allowed: true (default allow)
 */
export function checkFilesystemPolicy(
  filePath: string,
  operation: "read" | "write",
  config: SandboxConfig,
): SandboxCheckResult {
  const resolved = nodePath.posix.normalize(filePath.replace(/\\/g, "/"));

  // 1. Check deny patterns first (highest priority)
  for (const pattern of config.filesystem.deny) {
    if (minimatch(resolved, pattern)) {
      return {
        allowed: false,
        reason: `Filesystem deny: "${resolved}" matches deny pattern "${pattern}"`,
        matchedRule: pattern,
      };
    }
  }

  // 2. Check operation-specific allow patterns
  const allowPatterns = operation === "read" ? config.filesystem.read : config.filesystem.write;
  for (const pattern of allowPatterns) {
    if (minimatch(resolved, pattern)) {
      return { allowed: true, reason: "" };
    }
  }

  // 3. Default: allow if no deny matched
  return { allowed: true, reason: "" };
}

/**
 * Check whether a command is permitted.
 *
 * Matching logic (prefix-based):
 *   1. Check deny list -> command starts with deny prefix => allowed: false
 *   2. Check allow list -> command starts with allow prefix => allowed: true
 *   3. No rule matched -> allowed: true (default allow)
 */
export function checkCommandPolicy(
  command: string,
  config: SandboxConfig,
): SandboxCheckResult {
  // 1. Check deny patterns first (highest priority)
  for (const denyPattern of config.commands.deny) {
    if (command.startsWith(denyPattern) || command === denyPattern) {
      return {
        allowed: false,
        reason: `Command deny: "${command}" matches deny pattern "${denyPattern}"`,
        matchedRule: denyPattern,
      };
    }
  }

  // 2. Check allow patterns (prefix match, "*" matches everything)
  for (const allowPattern of config.commands.allow) {
    if (allowPattern === "*" || command.startsWith(allowPattern)) {
      return { allowed: true, reason: "" };
    }
  }

  // 3. Default: allow if no deny matched
  return { allowed: true, reason: "" };
}

/**
 * Extract hostname from a URL string.
 */
function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    // Not a valid URL, return as-is for substring matching
    return url;
  }
}

/**
 * Check whether a network URL is permitted.
 *
 * Matching logic (domain/pattern-based):
 *   1. Check deny list -> hostname matches deny pattern => allowed: false
 *   2. Check allow list -> hostname matches allow pattern => allowed: true
 *   3. No rule matched -> allowed: true (default allow)
 *
 * Patterns containing glob chars (*, ?, **) use minimatch on hostname.
 * Plain domain strings use substring matching on the full URL.
 */
export function checkNetworkPolicy(
  url: string,
  config: SandboxConfig,
): SandboxCheckResult {
  const hostname = extractHostname(url);
  const hasGlob = (s: string) => s.includes("*") || s.includes("?");

  // 1. Check deny patterns first (highest priority)
  for (const denyPattern of config.network.deny) {
    if (denyPattern === "*" || (hasGlob(denyPattern) ? minimatch(hostname, denyPattern) : url.includes(denyPattern))) {
      return {
        allowed: false,
        reason: `Network deny: "${url}" matches deny pattern "${denyPattern}"`,
        matchedRule: denyPattern,
      };
    }
  }

  // 2. Check allow patterns
  for (const allowPattern of config.network.allow) {
    if (allowPattern === "*" || (hasGlob(allowPattern) ? minimatch(hostname, allowPattern) : url.includes(allowPattern))) {
      return { allowed: true, reason: "" };
    }
  }

  // 3. Default: allow if no deny matched
  return { allowed: true, reason: "" };
}

/** @todo Task 4: implement loadSandboxConfig */
export function loadSandboxConfig(_configPath?: string): SandboxConfig {
  return { ...DEFAULT_SANDBOX_CONFIG };
}

/** @todo Task 4: implement resolveProfile */
export function resolveProfile(
  _config: SandboxConfig,
  _profileName?: string,
): SandboxConfig {
  return { ...DEFAULT_SANDBOX_CONFIG };
}
