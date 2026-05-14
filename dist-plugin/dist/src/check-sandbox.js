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
import { checkFileAccess, checkNetworkAccess } from "./sandbox-policy.js";
const NETWORK_COMMANDS = [
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
export function detectNetworkCommand(command) {
    for (const { pattern, defaultPort, defaultHost } of NETWORK_COMMANDS) {
        if (!pattern.test(command))
            continue;
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
export function extractTargetFromBash(command) {
    // Match > or >> followed by a file path
    const match = command.match(/>{1,2}\s*([^\s;&|]+)/);
    return match ? match[1] : null;
}
/**
 * Check whether a tool call is permitted under sandbox policy.
 *
 * @param toolType - The tool name (Write, Edit, Bash, etc.)
 * @param toolInput - JSON string of the tool's input
 * @param configPath - Path to .forge/.sandbox-active.json
 */
export function checkSandboxAccess(toolType, toolInput, configPath) {
    // No config file → sandbox not active → allow all
    if (!existsSync(configPath)) {
        return { allowed: true, reason: "" };
    }
    let config;
    try {
        config = JSON.parse(readFileSync(configPath, "utf-8"));
    }
    catch {
        return { allowed: false, reason: "Sandbox: failed to parse policy config" };
    }
    if (toolType === "Write" || toolType === "Edit") {
        let parsed;
        try {
            parsed = JSON.parse(toolInput);
        }
        catch {
            return { allowed: false, reason: "Sandbox: failed to parse tool input" };
        }
        const filePath = (parsed.file_path ?? parsed.path ?? "");
        if (!filePath)
            return { allowed: true, reason: "" };
        return checkFileAccess(filePath, config.policy.fileSystem);
    }
    if (toolType === "Bash") {
        let parsed;
        try {
            parsed = JSON.parse(toolInput);
        }
        catch {
            return { allowed: false, reason: "Sandbox: failed to parse tool input" };
        }
        const command = (parsed.command ?? "");
        // Check file redirect target
        const redirectTarget = extractTargetFromBash(command);
        if (redirectTarget) {
            const fileDecision = checkFileAccess(redirectTarget, config.policy.fileSystem);
            if (!fileDecision.allowed)
                return fileDecision;
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
        return { allowed: true, reason: "" };
    }
    // Other tool types (Read, Glob, Grep, etc.) — allow
    return { allowed: true, reason: "" };
}
// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
function main() {
    const toolType = process.argv[2];
    const toolInputFile = process.argv[3];
    if (!toolType || !toolInputFile)
        process.exit(0);
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
const isMainModule = process.argv[1]?.includes("check-sandbox") && !process.argv[1]?.includes("test");
if (isMainModule) {
    main();
}
//# sourceMappingURL=check-sandbox.js.map