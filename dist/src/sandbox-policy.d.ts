/**
 * Sandbox Policy — pure functions for file system and network access control.
 *
 * All functions are side-effect free: accept path/policy, return decision.
 * Used by check-sandbox.ts (PreToolUse hook) and SdkDriver (startup validation).
 *
 * **Validates: Requirements 1, 2, 3, 5**
 */
export interface FileSystemPolicy {
    allow: string[];
    deny: string[];
}
export interface NetworkPolicy {
    mode: "none" | "restricted" | "open";
    allow?: string[];
}
export interface PermissionPolicy {
    fileSystem: FileSystemPolicy;
    network: NetworkPolicy;
}
export interface AccessDecision {
    allowed: boolean;
    reason: string;
}
/**
 * Check whether a file path is permitted under the given file system policy.
 *
 * Deny patterns take priority over allow patterns.
 * Returns an AccessDecision with a descriptive reason on denial.
 */
export declare function checkFileAccess(filePath: string, policy: FileSystemPolicy): AccessDecision;
/**
 * Check whether a network endpoint is permitted under the given network policy.
 *
 * Modes:
 *   - "none": deny all
 *   - "restricted": allow only whitelisted endpoints
 *   - "open": allow all
 */
export declare function checkNetworkAccess(endpoint: string, policy: NetworkPolicy): AccessDecision;
export interface PolicyValidationResult {
    valid: boolean;
    errors: string[];
}
/**
 * Validate a sandbox policy configuration object.
 * Returns a list of validation errors (empty when valid).
 */
export declare function validatePolicy(config: unknown): PolicyValidationResult;
/**
 * Build the default permission policy for a project root.
 *
 * Default: allow all files under project root, deny paths outside.
 * Network mode is "open" for backward compatibility.
 */
export declare function buildDefaultPolicy(projectRoot: string): PermissionPolicy;
