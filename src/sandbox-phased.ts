/**
 * Phased Sandbox Implementation — Phase 1: Declarative Configuration.
 *
 * Provides a declarative .tinkerman/sandbox.json config format with pure function
 * policy checks. Phase 1 is advisory only (no enforcement).
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 */

import { existsSync, readFileSync } from "node:fs";
import * as nodePath from "node:path";
import { minimatch } from "minimatch";
import { canonicalizePathExpression, extractPathExpressionsFromBash } from "./path-equivalence.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Sandbox configuration for Phase 1 declarative sandbox.
 *
 * Format: .tinkerman/sandbox.json
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
 * Used when .tinkerman/sandbox.json does not exist or is malformed.
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

/** Options for path-equivalence-aware policy checks. */
export interface PathPolicyOptions {
  cwd: string;
  homeDir: string;
}

/**
 * Check whether a file path is permitted for the given operation.
 *
 * Matching logic:
 *   1. Canonicalize path (expand ~, $HOME, normalize ..)
 *   2. Check deny list -> hit means allowed: false (highest priority)
 *   3. Check allow list (read or write based on operation) -> hit means allowed: true
 *   4. No rule matched -> allowed: true (default allow)
 */
export function checkFilesystemPolicy(
  filePath: string,
  operation: "read" | "write",
  config: SandboxConfig,
  pathOpts?: PathPolicyOptions,
): SandboxCheckResult {
  // Canonicalize if path options provided
  let resolved: string;
  if (pathOpts) {
    const canonical = canonicalizePathExpression(filePath, pathOpts);
    resolved = canonical.normalized;
    // Fail closed for high-risk unresolved frozen-zone paths
    if (canonical.highRiskUnresolved) {
      return {
        allowed: false,
        reason: `Filesystem deny: path "${filePath}" contains frozen-zone signal but cannot be reliably resolved (fail-closed)`,
        matchedRule: "fail-closed:unresolved-frozen-zone",
      };
    }
  } else {
    resolved = nodePath.posix.normalize(filePath.replace(/\\/g, "/"));
  }

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
 * Matching logic (prefix-based + path extraction):
 *   1. Check deny list -> command starts with deny prefix => allowed: false
 *   2. Extract path expressions from command, canonicalize, check deny rules
 *   3. Check allow list -> command starts with allow prefix => allowed: true
 *   4. No rule matched -> allowed: true (default allow)
 */
export function checkCommandPolicy(
  command: string,
  config: SandboxConfig,
  pathOpts?: PathPolicyOptions,
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

  // 2. Path-equivalence-aware deny check
  if (pathOpts && config.filesystem.deny.length > 0) {
    const extractedPaths = extractPathExpressionsFromBash(command);
    for (const rawPath of extractedPaths) {
      const canonical = canonicalizePathExpression(rawPath, pathOpts);
      for (const pattern of config.filesystem.deny) {
        if (minimatch(canonical.normalized, pattern)) {
          return {
            allowed: false,
            reason: `Command deny: extracted path "${rawPath}" → "${canonical.normalized}" matches filesystem deny pattern "${pattern}"`,
            matchedRule: pattern,
          };
        }
      }
    }
  }

  // 3. Check allow patterns (prefix match, "*" matches everything)
  for (const allowPattern of config.commands.allow) {
    if (allowPattern === "*" || command.startsWith(allowPattern)) {
      return { allowed: true, reason: "" };
    }
  }

  // 4. Default: allow if no deny matched
  return { allowed: true, reason: "" };
}

/**
 * Extract hostname from a URL string.
 */
function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch (_err: unknown) {
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
export function checkNetworkPolicy(url: string, config: SandboxConfig): SandboxCheckResult {
  const hostname = extractHostname(url);
  const hasGlob = (s: string) => s.includes("*") || s.includes("?");

  // 1. Check deny patterns first (highest priority)
  for (const denyPattern of config.network.deny) {
    if (
      denyPattern === "*" ||
      (hasGlob(denyPattern) ? minimatch(hostname, denyPattern) : url.includes(denyPattern))
    ) {
      return {
        allowed: false,
        reason: `Network deny: "${url}" matches deny pattern "${denyPattern}"`,
        matchedRule: denyPattern,
      };
    }
  }

  // 2. Check allow patterns
  for (const allowPattern of config.network.allow) {
    if (
      allowPattern === "*" ||
      (hasGlob(allowPattern) ? minimatch(hostname, allowPattern) : url.includes(allowPattern))
    ) {
      return { allowed: true, reason: "" };
    }
  }

  // 3. Default: allow if no deny matched
  return { allowed: true, reason: "" };
}

/**
 * Load sandbox configuration from a JSON file.
 *
 * - File does not exist: returns DEFAULT_SANDBOX_CONFIG (everything allowed)
 * - File is malformed JSON: returns DEFAULT_SANDBOX_CONFIG with warning to stderr
 * - File has wrong structure: returns DEFAULT_SANDBOX_CONFIG with warning to stderr
 */
export function loadSandboxConfig(configPath?: string): SandboxConfig {
  if (configPath && existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;

      if (isValidSandboxConfig(parsed)) {
        return parsed;
      }

      // Invalid sandbox config structure — degrade to default (caller can validate separately)
    } catch (_err) {
      // Failed to parse sandbox config — degrade to default
    }
  }

  return { ...DEFAULT_SANDBOX_CONFIG };
}

/**
 * Validate that an unknown value conforms to the SandboxConfig interface.
 */
function isValidSandboxConfig(value: unknown): value is SandboxConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const cfg = value as Record<string, unknown>;

  if (cfg.version !== 1) return false;
  if (typeof cfg.profile !== "string") return false;

  // filesystem
  if (typeof cfg.filesystem !== "object" || cfg.filesystem === null) return false;
  const fs = cfg.filesystem as Record<string, unknown>;
  if (!Array.isArray(fs.read) || !Array.isArray(fs.write) || !Array.isArray(fs.deny)) return false;

  // network
  if (typeof cfg.network !== "object" || cfg.network === null) return false;
  const net = cfg.network as Record<string, unknown>;
  if (!Array.isArray(net.allow) || !Array.isArray(net.deny)) return false;

  // commands
  if (typeof cfg.commands !== "object" || cfg.commands === null) return false;
  const cmd = cfg.commands as Record<string, unknown>;
  if (!Array.isArray(cmd.allow) || !Array.isArray(cmd.deny)) return false;

  return true;
}

/**
 * Resolve a named profile from the configuration.
 *
 * In Phase 1, profile is just a label (config.profile field).
 * If profileName is provided, it must match config.profile.
 * Future phases may support multi-profile configs.
 */
export function resolveProfile(config: SandboxConfig, profileName?: string): SandboxConfig {
  const targetProfile = profileName ?? config.profile;

  if (targetProfile === config.profile) {
    return config;
  }

  throw new Error(
    `Sandbox profile "${targetProfile}" not found. Available profiles: ${config.profile}`,
  );
}
