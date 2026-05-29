/**
 * Sandbox Policy — pure functions for file system and network access control.
 *
 * All functions are side-effect free: accept path/policy, return decision.
 * Used by check-sandbox.ts (PreToolUse hook) and SdkDriver (startup validation).
 *
 * **Validates: Requirements 1, 2, 3, 5**
 *
 * Re-exports Phase 1 declarative sandbox types and functions from sandbox-phased.ts,
 * making this module the canonical import point for all sandbox-related types.
 */

import * as path from "node:path";
import { minimatch } from "minimatch";

// Phase 1: Declarative sandbox config (spec task #1 — 扩展 sandbox-policy.ts)
export type { SandboxConfig, SandboxCheckResult } from "./sandbox-phased.js";
export {
  checkFilesystemPolicy,
  checkCommandPolicy,
  checkNetworkPolicy,
  loadSandboxConfig,
  resolveProfile,
  DEFAULT_SANDBOX_CONFIG,
} from "./sandbox-phased.js";

// ---------------------------------------------------------------------------
// Types (legacy — used by runtime enforcement layer: check-sandbox.ts, sdk-sandbox-policy.ts)
//
// NOTE: These types use default-deny semantics (unmatched → denied).
// Phase 1 types (SandboxConfig + SandboxCheckResult, re-exported above) use
// default-allow semantics (unmatched → allowed) for advisory mode.
// Migrating consumers must account for this behavioral difference.
// ---------------------------------------------------------------------------

/** @deprecated Use SandboxConfig (re-exported above) for Phase 1 declarative config. */
export interface FileSystemPolicy {
  allow: string[];
  deny: string[];
}

/** @deprecated Use SandboxConfig (re-exported above) for Phase 1 declarative config. */
export interface NetworkPolicy {
  mode: "none" | "restricted" | "open";
  allow?: string[];
}

/** @deprecated Use SandboxConfig (re-exported above) for Phase 1 declarative config. */
export interface PermissionPolicy {
  fileSystem: FileSystemPolicy;
  network: NetworkPolicy;
}

/** @deprecated Use SandboxCheckResult (re-exported above) for Phase 1 checks. */
export interface AccessDecision {
  allowed: boolean;
  reason: string;
}

// ---------------------------------------------------------------------------
// checkFileAccess (Requirement 1, 5)
// ---------------------------------------------------------------------------

/**
 * Check whether a file path is permitted under the given file system policy.
 *
 * Deny patterns take priority over allow patterns.
 * Returns an AccessDecision with a descriptive reason on denial.
 *
 * @deprecated Use checkFilesystemPolicy (re-exported above) for Phase 1 checks.
 * Note: this function defaults to DENY on no match; checkFilesystemPolicy defaults to ALLOW.
 */
export function checkFileAccess(filePath: string, policy: FileSystemPolicy): AccessDecision {
  // Normalize: resolve .. segments, unify separators, ensure consistent matching
  const resolved = path.posix.normalize(filePath.replace(/\\/g, "/"));

  // Check deny patterns first (higher priority)
  for (const pattern of policy.deny) {
    if (minimatch(resolved, pattern)) {
      return {
        allowed: false,
        reason: `Access denied: "${resolved}" matches deny pattern "${pattern}"`,
      };
    }
  }

  // Check allow patterns
  for (const pattern of policy.allow) {
    if (minimatch(resolved, pattern)) {
      return { allowed: true, reason: "" };
    }
  }

  return {
    allowed: false,
    reason: `Access denied: "${resolved}" does not match any allow pattern`,
  };
}

// ---------------------------------------------------------------------------
// checkNetworkAccess (Requirement 2)
// ---------------------------------------------------------------------------

/**
 * Check whether a network endpoint is permitted under the given network policy.
 *
 * Modes:
 *   - "none": deny all
 *   - "restricted": allow only whitelisted endpoints
 *   - "open": allow all
 *
 * @deprecated Use checkNetworkPolicy (re-exported above) for Phase 1 checks.
 */
export function checkNetworkAccess(endpoint: string, policy: NetworkPolicy): AccessDecision {
  if (policy.mode === "open") {
    return { allowed: true, reason: "" };
  }

  if (policy.mode === "none") {
    return {
      allowed: false,
      reason: `Network access denied: mode is "none", endpoint "${endpoint}"`,
    };
  }

  // restricted mode — check allow list
  const allowList = policy.allow ?? [];
  for (const allowed of allowList) {
    if (endpointMatches(endpoint, allowed)) {
      return { allowed: true, reason: "" };
    }
  }

  return {
    allowed: false,
    reason: `Network access denied: "${endpoint}" not in restricted allow list`,
  };
}

/**
 * Check if an endpoint matches an allow entry.
 * Supports "domain" (matches any port) and "domain:port" (exact match).
 */
function endpointMatches(endpoint: string, allowed: string): boolean {
  // Exact match
  if (endpoint === allowed) return true;

  // Allow entry without port — match any port on that domain
  if (!allowed.includes(":")) {
    const domain = endpoint.split(":")[0];
    return domain === allowed;
  }

  return false;
}

// ---------------------------------------------------------------------------
// validatePolicy (Requirement 3)
// ---------------------------------------------------------------------------

export interface PolicyValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a sandbox policy configuration object.
 * Returns a list of validation errors (empty when valid).
 *
 * @deprecated Use loadSandboxConfig with isValidSandboxConfig (re-exported above) for Phase 1 validation.
 */
export function validatePolicy(config: unknown): PolicyValidationResult {
  const errors: string[] = [];

  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    return { valid: false, errors: ["Policy must be a non-null object"] };
  }

  const cfg = config as Record<string, unknown>;

  // fileSystem
  if (cfg.fileSystem == null || typeof cfg.fileSystem !== "object") {
    errors.push("Missing or invalid 'fileSystem' section");
  } else {
    const fs = cfg.fileSystem as Record<string, unknown>;
    if (!Array.isArray(fs.allow)) {
      errors.push("'fileSystem.allow' must be an array");
    }
    if (!Array.isArray(fs.deny)) {
      errors.push("'fileSystem.deny' must be an array");
    }
  }

  // network
  if (cfg.network == null || typeof cfg.network !== "object") {
    errors.push("Missing or invalid 'network' section");
  } else {
    const net = cfg.network as Record<string, unknown>;
    if (typeof net.mode !== "string" || !["none", "restricted", "open"].includes(net.mode)) {
      errors.push("'network.mode' must be 'none', 'restricted', or 'open'");
    }
    if (net.allow !== undefined && !Array.isArray(net.allow)) {
      errors.push("'network.allow' must be an array when present");
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// buildDefaultPolicy (Requirement 3.3)
// ---------------------------------------------------------------------------

/**
 * Build the default permission policy for a project root.
 *
 * Default: allow all files under project root, deny paths outside.
 * Network mode is "open" for backward compatibility.
 *
 * @deprecated Use DEFAULT_SANDBOX_CONFIG (re-exported above) for Phase 1 default config.
 */
export function buildDefaultPolicy(projectRoot: string): PermissionPolicy {
  const normalizedRoot = path.resolve(projectRoot).replace(/\\/g, "/");

  return {
    fileSystem: {
      allow: [`${normalizedRoot}/**`, normalizedRoot],
      deny: [
        `${normalizedRoot}/.forge/sandbox.json`,
        `${normalizedRoot}/.forge/.sandbox-active.json`,
      ],
    },
    network: {
      mode: "open",
    },
  };
}
