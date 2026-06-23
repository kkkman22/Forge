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
export type { SandboxCheckResult, SandboxConfig } from "./sandbox-phased.js";
export {
  checkCommandPolicy,
  checkFilesystemPolicy,
  checkNetworkPolicy,
  DEFAULT_SANDBOX_CONFIG,
  loadSandboxConfig,
  resolveProfile,
} from "./sandbox-phased.js";

/**
 * Authoritative default-semantics declaration [REQ-04].
 *
 * This module exposes TWO default semantics that are easy to confuse:
 *   - **Phase 1** (`SandboxConfig` + `checkFilesystemPolicy`/`checkNetworkPolicy`,
 *     re-exported above): **default-allow** (unmatched → allowed). This is the
 *     AUTHORITATIVE semantics for advisory-mode declarative config and what all
 *     NEW consumers should use.
 *   - **Legacy** (`FileSystemPolicy`/`NetworkPolicy` + `checkFileAccess`/
 *     `checkNetworkAccess`/`buildDefaultPolicy`, below): **default-deny**
 *     (unmatched → denied). Scoped to the RUNTIME ENFORCEMENT layer only
 *     (`check-sandbox.ts` PreToolUse hook + `sdk-sandbox-policy.ts` startup
 *     validation), where default-deny is the correct hardening posture.
 *
 * The trap: mixing the two and assuming the wrong default — e.g. consuming
 * Phase 1 `SandboxConfig` while expecting unmatched paths to be denied, or
 * consuming legacy types while expecting them to allow. This declaration makes
 * the authoritative choice explicit and machine-checkable, and records the
 * migration cutoff so the dual track does not persist indefinitely.
 */
export const SANDBOX_DEFAULT_SEMANTICS = {
  /** The authoritative (advisory-mode) default semantics for new consumers. */
  authoritative: "default-allow" as const,
  /** The legacy runtime-enforcement default semantics. */
  legacySemantics: "default-deny" as const,
  /** Where the legacy default-deny semantics legitimately applies. */
  legacyScope: "runtime enforcement layer (check-sandbox.ts, sdk-sandbox-policy.ts)",
  /**
   * Migration cutoff: legacy types/functions are slated for removal once all
   * runtime-enforcement consumers move to Phase 1 declarative config. New code
   * must not introduce fresh dependencies on the legacy default-deny API.
   */
  migrationCutoff: "post Phase 1 enforcement-layer migration (tracked separately)",
} as const;

/**
 * One-shot runtime deprecation signal for the legacy default-deny API [REQ-04].
 *
 * Each legacy function (checkFileAccess / checkNetworkAccess / validatePolicy /
 * buildDefaultPolicy) calls this on first invocation. It emits a single
 * `console.warn` per process so the misuse risk — a new consumer reaching for
 * the legacy default-deny types while expecting default-allow, or vice versa —
 * is CI-visible (vitest captures console.warn) without spamming on every call
 * from the legitimate runtime-enforcement consumers (check-sandbox.ts,
 * sdk-sandbox-policy.ts).
 */
let _legacyDeprecationEmitted = false;
function emitLegacyDeprecation(): void {
  if (_legacyDeprecationEmitted) return;
  _legacyDeprecationEmitted = true;
  // biome-ignore lint/suspicious/noConsole: one-shot deprecation signal is intentional
  console.warn(
    "[sandbox-policy] legacy default-deny API (FileSystemPolicy/checkFileAccess/...) used. " +
      "This is default-DENY and scoped to the runtime enforcement layer. " +
      "New consumers must use the Phase 1 SandboxConfig API (default-allow, advisory). " +
      "See SANDBOX_DEFAULT_SEMANTICS.",
  );
}

// ---------------------------------------------------------------------------
// Types (legacy — used by runtime enforcement layer: check-sandbox.ts, sdk-sandbox-policy.ts)
//
// NOTE: These types use default-deny semantics (unmatched → denied).
// Phase 1 types (SandboxConfig + SandboxCheckResult, re-exported above) use
// default-allow semantics (unmatched → allowed) for advisory mode. See
// SANDBOX_DEFAULT_SEMANTICS above for the authoritative declaration.
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
  emitLegacyDeprecation();
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
  emitLegacyDeprecation();
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
  emitLegacyDeprecation();
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
  emitLegacyDeprecation();
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
