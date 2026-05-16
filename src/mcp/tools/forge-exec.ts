/**
 * forge_exec — sandboxed shell command execution with output trimming.
 *
 * Intended for: test runners, lint, typecheck, CI commands, any command
 * producing >30 lines of output.
 *
 * NOT for: file mutations, git writes, interactive commands.
 *
 * Security: reads deny patterns from `.claude/settings.json` permissions
 * and blocks matching commands before execution.
 *
 * **Validates: Requirement 2**
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ResolvedRoot } from "../project-root.js";
import { trimCommandOutput } from "../trimmers/output.js";

// ---------------------------------------------------------------------------
// Deny-rule helpers
// ---------------------------------------------------------------------------

/**
 * Read deny patterns from `.claude/settings.json`.
 *
 * Patterns follow the Claude Code format: `Bash(glob)`.
 * Returns the raw pattern strings from `permissions.deny`.
 */
export async function readDenyPatterns(settingsPath = ".claude/settings.json"): Promise<string[]> {
  try {
    const raw = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(raw) as Record<string, unknown>;
    const permissions = settings.permissions as Record<string, unknown> | undefined;
    if (!permissions) return [];
    const deny = permissions.deny;
    if (!Array.isArray(deny)) return [];
    return deny.filter((p): p is string => typeof p === "string");
  } catch {
    // File missing or unparseable — no deny rules
    return [];
  }
}

/**
 * Escape a character for use in a regex pattern.
 */
function escapeRegexChar(ch: string): string {
  return `\\${ch}`;
}

/**
 * Check whether a command is blocked by any deny pattern.
 *
 * Deny patterns use the Claude Code format `Bash(glob)`.
 * The glob inside the parentheses is matched against the command string.
 * A simple wildcard match is used (supports `*` as any-chars wildcard).
 */
export function isCommandDenied(command: string, denyPatterns: string[]): string | null {
  for (const pattern of denyPatterns) {
    // Extract glob from Bash(...) wrapper
    const match = pattern.match(/^Bash\((.+)\)$/);
    if (!match) continue;

    const glob = match[1];
    // Convert simple glob to regex: escape special chars, replace * with .*
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, escapeRegexChar).replace(/\*/g, ".*");
    const re = new RegExp(`^${escaped}$`);
    if (re.test(command)) {
      return `Command denied by pattern: ${pattern}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Subprocess execution
// ---------------------------------------------------------------------------

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

/**
 * Execute a shell command in a child subprocess with timeout support.
 */
export function execCommand(
  command: string,
  timeoutMs: number,
  options?: { cwd?: string },
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(
      "/bin/sh",
      ["-c", command],
      {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        ...(options?.cwd ? { cwd: options.cwd } : {}),
      },
      (error, stdout, stderr) => {
        if (error && "killed" in error && error.killed) {
          resolve({ stdout: String(stdout), stderr: String(stderr), exitCode: 1, timedOut: true });
          return;
        }
        const exitCode = error && "code" in error ? ((error.code as number) ?? 1) : 0;
        resolve({ stdout: String(stdout), stderr: String(stderr), exitCode, timedOut: false });
      },
    );

    // Safety: if the child is somehow null, resolve immediately
    if (!child) {
      resolve({ stdout: "", stderr: "Failed to spawn subprocess", exitCode: 1, timedOut: false });
    }
  });
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

const TOOL_DESCRIPTION = [
  "Execute a shell command in a sandboxed subprocess with automatic output trimming.",
  "",
  "Intended for: test runners, lint, typecheck, CI commands, any command producing >30 lines of output.",
  "NOT for: file mutations, git writes, interactive commands.",
  "",
  "Behavior:",
  "- Success + ≤30 lines: returns full output",
  "- Success + >30 lines: returns trimmed summary (key lines + last 5 lines)",
  "- Failure (non-zero exit): returns complete output unchanged (Forge iron rule)",
  "- Timeout: kills subprocess and returns error",
].join("\n");

/**
 * Register the `forge_exec` tool on the given MCP server.
 */
export function registerForgeExec(server: McpServer, root?: ResolvedRoot): void {
  const settingsPath = root ? join(root.path, ".claude/settings.json") : undefined;
  server.tool(
    "forge_exec",
    TOOL_DESCRIPTION,
    {
      command: z.string().describe("Shell command to execute"),
      timeout: z.number().optional().default(30000).describe("Timeout in ms"),
    },
    async ({ command, timeout }) => {
      // 1. Check deny rules
      const denyPatterns = await readDenyPatterns(settingsPath);
      const denyReason = isCommandDenied(command, denyPatterns);
      if (denyReason) {
        return {
          content: [{ type: "text" as const, text: denyReason }],
          isError: true,
        };
      }

      // 2. Execute command
      const execOpts = root ? { cwd: root.path } : undefined;
      const result = await execCommand(command, timeout, execOpts);

      // 3. Handle timeout
      if (result.timedOut) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Command timed out after ${timeout}ms: ${command}`,
            },
          ],
          isError: true,
        };
      }

      // 4. Trim output and return
      const trimmed = trimCommandOutput(result.stdout, result.stderr, result.exitCode);
      return {
        content: [{ type: "text" as const, text: trimmed }],
        isError: result.exitCode !== 0,
      };
    },
  );
}
