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
export type { SandboxCheckResult, SandboxConfig } from "./sandbox-phased.js";
export { checkCommandPolicy, checkFilesystemPolicy, checkNetworkPolicy, DEFAULT_SANDBOX_CONFIG, loadSandboxConfig, resolveProfile, } from "./sandbox-phased.js";
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
/**
 * Check whether a file path is permitted under the given file system policy.
 *
 * Deny patterns take priority over allow patterns.
 * Returns an AccessDecision with a descriptive reason on denial.
 *
 * @deprecated Use checkFilesystemPolicy (re-exported above) for Phase 1 checks.
 * Note: this function defaults to DENY on no match; checkFilesystemPolicy defaults to ALLOW.
 */
export declare function checkFileAccess(filePath: string, policy: FileSystemPolicy): AccessDecision;
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
export declare function checkNetworkAccess(endpoint: string, policy: NetworkPolicy): AccessDecision;
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
export declare function validatePolicy(config: unknown): PolicyValidationResult;
/**
 * Build the default permission policy for a project root.
 *
 * Default: allow all files under project root, deny paths outside.
 * Network mode is "open" for backward compatibility.
 *
 * @deprecated Use DEFAULT_SANDBOX_CONFIG (re-exported above) for Phase 1 default config.
 */
export declare function buildDefaultPolicy(projectRoot: string): PermissionPolicy;
