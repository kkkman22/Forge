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

/** @todo Task 3: implement checkCommandPolicy */
export function checkCommandPolicy(
  _command: string,
  _config: SandboxConfig,
): SandboxCheckResult {
  return { allowed: false, reason: "not implemented" };
}

/** @todo Task 3: implement checkNetworkPolicy */
export function checkNetworkPolicy(
  _url: string,
  _config: SandboxConfig,
): SandboxCheckResult {
  return { allowed: false, reason: "not implemented" };
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
