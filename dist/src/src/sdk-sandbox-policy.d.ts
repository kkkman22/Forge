/**
 * SDK Sandbox Policy — loads and validates the sandbox permission policy
 * from the project's `.forge/sandbox.json` configuration file.
 *
 * Extracted from `sdk-driver.ts` as part of the SDK Driver Decomposition.
 * Design reference: sdk-driver-decomposition § design.md
 * **Validates: Requirements 2.1, 10.2**
 */
import { type PermissionPolicy } from "./sandbox-policy.js";
/**
 * Load sandbox policy from .forge/sandbox.json or return default.
 * Validates the config and falls back to default on validation failure.
 */
export declare function loadSandboxPolicy(cwd: string): PermissionPolicy;
