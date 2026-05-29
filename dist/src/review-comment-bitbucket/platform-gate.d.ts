import type { GateInput, GateResult } from "./types.js";
/**
 * Check if a URL host contains "bitbucket." subdomain
 */
export declare function isBitbucketUrl(url: string | null): boolean;
/**
 * Parse a remote URL to extract host and port
 * Supports HTTPS, SSH (git@host:path), and IPv6 URLs
 */
export declare function parseRemoteUrl(url: string): {
    host: string;
    port: number | null;
} | null;
/**
 * Compare two URLs to see if they have the same host and port
 * Case-insensitive, ignores scheme, path, query, fragment
 */
export declare function isSameHost(a: string | null, b: string | null): boolean;
/**
 * Select the best remote URL from a list of remotes
 * Priority: origin > upstream > first same-host > null
 */
export declare function selectRemoteUrl(remotes: Array<{
    name: string;
    url: string;
}>, mcpBaseUrl: string | null): string | null;
/**
 * Check the platform gate based on the decision matrix
 */
export declare function checkPlatformGate(input: GateInput): GateResult;
