/**
 * Sandbox access checker — PreToolUse hook for sandbox policy enforcement.
 *
 * Reads .forge/.sandbox-active.json (written by SdkDriver on --sandbox startup)
 * and checks Write/Edit/Bash tool calls against the loaded policy.
 *
 * Exit 0 = allow, exit 1 = deny (prints reason to stderr).
 *
 * **Validates: Requirements 1.3, 1.4, 2.3, 2.4, 4.4**
 */
import { type PermissionPolicy } from "./sandbox-policy.js";
export interface SandboxRuntimeConfig {
    projectRoot: string;
    policy: PermissionPolicy;
}
export interface NetworkDetectionResult {
    isNetwork: boolean;
    endpoint: string | null;
}
/**
 * Detect whether a Bash command involves network operations.
 * Extracts target endpoint if possible.
 */
export declare function detectNetworkCommand(command: string): NetworkDetectionResult;
/**
 * Extract file redirect target from a Bash command (e.g., "echo x > file.txt").
 */
export declare function extractTargetFromBash(command: string): string | null;
export interface SandboxAccessDecision {
    allowed: boolean;
    reason: string;
}
/**
 * Check whether a tool call is permitted under sandbox policy.
 *
 * @param toolType - The tool name (Write, Edit, Bash, etc.)
 * @param toolInput - JSON string of the tool's input
 * @param configPath - Path to .forge/.sandbox-active.json
 */
export declare function checkSandboxAccess(toolType: string, toolInput: string, configPath: string): SandboxAccessDecision;
