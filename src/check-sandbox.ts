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

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkDestructive } from "./destructive-guard.js";
import { contextFromNonce } from "./destructive-nonce.js";
import { checkFileAccess, checkNetworkAccess, type PermissionPolicy } from "./sandbox-policy.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SandboxRuntimeConfig {
  projectRoot: string;
  policy: PermissionPolicy;
}

// ---------------------------------------------------------------------------
// Network command detection (Requirement 2.3)
// ---------------------------------------------------------------------------

export interface NetworkDetectionResult {
  isNetwork: boolean;
  endpoint: string | null;
}

const NETWORK_COMMANDS: ReadonlyArray<{
  pattern: RegExp;
  defaultPort: number;
  defaultHost: string | null;
}> = [
  { pattern: /\bcurl\b/, defaultPort: 443, defaultHost: null },
  { pattern: /\bwget\b/, defaultPort: 80, defaultHost: null },
  { pattern: /\bnpm\s+publish\b/, defaultPort: 443, defaultHost: "registry.npmjs.org" },
  { pattern: /\bgit\s+push\b/, defaultPort: 0, defaultHost: null },
  { pattern: /\bssh\b/, defaultPort: 0, defaultHost: null },
  { pattern: /\bscp\b/, defaultPort: 0, defaultHost: null },
];

const URL_PATTERN = /https?:\/\/([a-zA-Z0-9.-]+)(?::(\d+))?/;
const HOST_PATTERN = /@([a-zA-Z0-9.-]+)/;

/**
 * Detect whether a Bash command involves network operations.
 * Extracts target endpoint if possible.
 */
export function detectNetworkCommand(command: string): NetworkDetectionResult {
  for (const { pattern, defaultPort, defaultHost } of NETWORK_COMMANDS) {
    if (!pattern.test(command)) continue;

    // Try to extract URL endpoint
    const urlMatch = command.match(URL_PATTERN);
    if (urlMatch) {
      const host = urlMatch[1];
      const port = urlMatch[2] ? Number.parseInt(urlMatch[2], 10) : defaultPort;
      return { isNetwork: true, endpoint: port > 0 ? `${host}:${port}` : host };
    }

    // Try to extract host from @ pattern (ssh/scp)
    const hostMatch = command.match(HOST_PATTERN);
    if (hostMatch) {
      return { isNetwork: true, endpoint: hostMatch[1] };
    }

    // Use default host (e.g., npm publish)
    if (defaultHost) {
      return { isNetwork: true, endpoint: `${defaultHost}:${defaultPort}` };
    }

    // Network command detected but endpoint extraction failed
    return { isNetwork: true, endpoint: null };
  }

  return { isNetwork: false, endpoint: null };
}

// ---------------------------------------------------------------------------
// Bash file redirect extraction
// ---------------------------------------------------------------------------

/**
 * Extract file redirect target from a Bash command (e.g., "echo x > file.txt").
 */
export function extractTargetFromBash(command: string): string | null {
  // Match > or >> followed by a file path
  const match = command.match(/>{1,2}\s*([^\s;&|]+)/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Core sandbox access check
// ---------------------------------------------------------------------------

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
export function checkSandboxAccess(
  toolType: string,
  toolInput: string,
  configPath: string,
): SandboxAccessDecision {
  // No config file → sandbox not active → allow all
  if (!existsSync(configPath)) {
    return { allowed: true, reason: "" };
  }

  let config: SandboxRuntimeConfig;
  try {
    config = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (_err: unknown) {
    return { allowed: false, reason: "Sandbox: failed to parse policy config" };
  }

  if (toolType === "Write" || toolType === "Edit") {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(toolInput);
    } catch (_err: unknown) {
      return { allowed: false, reason: "Sandbox: failed to parse tool input" };
    }
    const filePath = (parsed.file_path ?? parsed.path ?? "") as string;
    if (!filePath) return { allowed: true, reason: "" };

    return checkFileAccess(filePath, config.policy.fileSystem);
  }

  if (toolType === "Bash") {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(toolInput);
    } catch (_err: unknown) {
      return { allowed: false, reason: "Sandbox: failed to parse tool input" };
    }
    const command = (parsed.command ?? "") as string;

    // Check file redirect target
    const redirectTarget = extractTargetFromBash(command);
    if (redirectTarget) {
      const fileDecision = checkFileAccess(redirectTarget, config.policy.fileSystem);
      if (!fileDecision.allowed) return fileDecision;
    }

    // Check network access
    const netResult = detectNetworkCommand(command);
    if (netResult.isNetwork) {
      if (netResult.endpoint) {
        return checkNetworkAccess(netResult.endpoint, config.policy.network);
      }
      // Network command detected but no specific endpoint — deny in restricted/none mode
      if (config.policy.network.mode !== "open") {
        return {
          allowed: false,
          reason: `Network access denied: "${command}" involves network operation but endpoint could not be extracted`,
        };
      }
    }

    // Destructive-command guard (v2: nonce + config, short-circuit deny).
    // Context assembled from trusted nonce files + config.md destructive_guard,
    // so the hook honours Forge's own rollback path (nonce-verified) and
    // config.md `off` propagates here without env-only bypass (P0-2/P0-3/P0-5).
    const projectRoot = process.cwd();
    const destructive = checkDestructive(command, contextFromNonce(process.env, projectRoot));
    if (!destructive.allowed) {
      return { allowed: false, reason: `🛑 Destructive guard: ${destructive.reason}` };
    }

    return { allowed: true, reason: "" };
  }

  // Other tool types (Read, Glob, Grep, etc.) — allow
  return { allowed: true, reason: "" };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

/**
 * @deprecated CLI entry point is deprecated — use SDK native sandbox via `--sandbox` instead.
 * Retained for backward compatibility with existing hooks.json configurations.
 */
function main(): void {
  const toolType = process.argv[2];
  const toolInputFile = process.argv[3];

  if (!toolType || !toolInputFile) process.exit(0);

  const configPath = resolve(process.cwd(), ".forge/.sandbox-active.json");
  const toolInput = readFileSync(toolInputFile, "utf-8");

  const decision = checkSandboxAccess(toolType, toolInput, configPath);

  if (!decision.allowed) {
    process.stderr.write(`🛑 Sandbox: ${decision.reason}\n`);
    process.exit(1);
  }

  process.exit(0);
}

// Run as CLI only when executed directly
const isMainModule =
  process.argv[1]?.includes("check-sandbox") && !process.argv[1]?.includes("test");
if (isMainModule) {
  main();
}
