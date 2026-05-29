/**
 * Phased Sandbox Implementation — Phase 1: Declarative Configuration.
 *
 * Provides a declarative .forge/sandbox.json config format with pure function
 * policy checks. Phase 1 is advisory only (no enforcement).
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 */
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
/**
 * Default sandbox configuration: everything allowed.
 * Used when .forge/sandbox.json does not exist or is malformed.
 */
export declare const DEFAULT_SANDBOX_CONFIG: SandboxConfig;
/**
 * Check whether a file path is permitted for the given operation.
 *
 * Matching logic:
 *   1. Check deny list -> hit means allowed: false (highest priority)
 *   2. Check allow list (read or write based on operation) -> hit means allowed: true
 *   3. No rule matched -> allowed: true (default allow)
 */
export declare function checkFilesystemPolicy(filePath: string, operation: "read" | "write", config: SandboxConfig): SandboxCheckResult;
/**
 * Check whether a command is permitted.
 *
 * Matching logic (prefix-based):
 *   1. Check deny list -> command starts with deny prefix => allowed: false
 *   2. Check allow list -> command starts with allow prefix => allowed: true
 *   3. No rule matched -> allowed: true (default allow)
 */
export declare function checkCommandPolicy(command: string, config: SandboxConfig): SandboxCheckResult;
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
export declare function checkNetworkPolicy(url: string, config: SandboxConfig): SandboxCheckResult;
/**
 * Load sandbox configuration from a JSON file.
 *
 * - File does not exist: returns DEFAULT_SANDBOX_CONFIG (everything allowed)
 * - File is malformed JSON: returns DEFAULT_SANDBOX_CONFIG with warning to stderr
 * - File has wrong structure: returns DEFAULT_SANDBOX_CONFIG with warning to stderr
 */
export declare function loadSandboxConfig(configPath?: string): SandboxConfig;
/**
 * Resolve a named profile from the configuration.
 *
 * In Phase 1, profile is just a label (config.profile field).
 * If profileName is provided, it must match config.profile.
 * Future phases may support multi-profile configs.
 */
export declare function resolveProfile(config: SandboxConfig, profileName?: string): SandboxConfig;
