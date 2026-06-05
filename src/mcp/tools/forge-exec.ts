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

import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDescendants, killProcessTree } from "../../process-tree-cleaner.js";
import type { ResolvedRoot } from "../project-root.js";
import { isRtkAvailable, trimCommandOutput, trimWithFallback } from "../trimmers/output.js";

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
  } catch (_err: unknown) {
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
/** Cache compiled glob → RegExp to avoid recompilation on every deny check. */
const globRegexCache = new Map<string, RegExp>();

export function isCommandDenied(command: string, denyPatterns: string[]): string | null {
  for (const pattern of denyPatterns) {
    // Extract glob from Bash(...) wrapper
    const match = pattern.match(/^Bash\((.+)\)$/);
    if (!match) continue;

    const glob = match[1];
    let re = globRegexCache.get(glob);
    if (re === undefined) {
      // Convert simple glob to regex: escape special chars (excluding ? and *),
      // then replace * → .* and ? → . for glob semantics
      const escaped = glob
        .replace(/[.+^${}()|[\]\\]/g, escapeRegexChar)
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");
      re = new RegExp(`^${escaped}$`);
      globRegexCache.set(glob, re);
    }
    if (re.test(command)) {
      return `Command denied by pattern: ${pattern}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shell metachar detection (defense-in-depth)
// ---------------------------------------------------------------------------

const SHELL_METACHAR_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\$\(/, label: "$()" },
  { pattern: /`/, label: "`" },
  { pattern: /\n/, label: "newline" },
  { pattern: /\r/, label: "carriage-return" },
];

/**
 * Detect shell metacharacters that could enable command injection.
 * Returns the metachar label if found, or null if the command appears safe.
 *
 * Defense-in-depth: flags command substitution ($() and ``) and control
 * characters that allow opaque embedding of subcommands. Standard shell
 * operators (;, &, |, >, <) are NOT flagged because forge_exec already
 * invokes via `sh -c` — these operators are part of normal shell usage.
 */
export function containsShellMetachars(command: string): string | null {
  for (const { pattern, label } of SHELL_METACHAR_PATTERNS) {
    if (pattern.test(command)) {
      return `Command contains shell metacharacters: ${label}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Simple command detection (array-mode vs sh -c)
// ---------------------------------------------------------------------------

/**
 * Shell operator characters that indicate a command needs shell interpretation.
 * If none of these are present (outside of quoted strings), the command can be
 * split into [bin, ...args] and executed directly without `/bin/sh -c`.
 */
const SHELL_OPERATOR_RE = /[|;&><`\n\r]/;

/**
 * Check if a command is a "simple" command — a single binary with arguments,
 * no shell operators. Simple commands can be executed via `execFile(bin, args)`
 * without going through `/bin/sh -c`, eliminating shell injection risk.
 */
export function isSimpleCommand(command: string): boolean {
  const trimmed = command.trim();
  if (trimmed.length === 0) return false;
  return !SHELL_OPERATOR_RE.test(trimmed);
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
 *
 * For simple commands (no shell operators), uses `execFile` directly with
 * array arguments — no shell interpretation, no injection risk.
 * For complex commands (pipes, redirects, etc.), falls back to `/bin/sh -c`.
 */
export function execCommand(
  command: string,
  timeoutMs: number,
  options?: { cwd?: string },
): Promise<ExecResult> {
  return new Promise((resolve) => {
    if (isSimpleCommand(command)) {
      // Safe path: split into [bin, ...args] and exec directly
      const parts = command.trim().split(/\s+/);
      const bin = parts[0];
      const args = parts.slice(1);
      const child = execFile(
        bin,
        args,
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
      if (!child) {
        resolve({ stdout: "", stderr: "Failed to spawn subprocess", exitCode: 1, timedOut: false });
      }
    } else {
      // Complex command: needs shell interpretation
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
      if (!child) {
        resolve({ stdout: "", stderr: "Failed to spawn subprocess", exitCode: 1, timedOut: false });
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Tracked execution with process group reaping
// ---------------------------------------------------------------------------

export interface ExecTrackedOptions {
  cwd?: string;
  timeoutMs: number;
  reapGraceMs: number;
}

export interface ExecTrackedResult extends ExecResult {
  reapedPids: number[];
  reapErrors: string[];
}

/**
 * Execute a shell command in a detached process group with background
 * process reaping. Uses existing process-tree-cleaner for cleanup.
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.5, 6.7, 6.8**
 */
export function execCommandTracked(
  command: string,
  options: ExecTrackedOptions,
): Promise<ExecTrackedResult> {
  return new Promise((resolve) => {
    const reapedPids: number[] = [];
    const reapErrors: string[] = [];

    let settled = false;
    const child = spawn("/bin/sh", ["-c", command], {
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
      ...(options.cwd ? { cwd: options.cwd } : {}),
    });

    const rootPid = child.pid ?? 0;
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    // Timeout handler
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;

      // Kill the entire process group
      try {
        if (rootPid > 0) process.kill(-rootPid, "SIGTERM");
      } catch (_err: unknown) {
        // Process may have already exited
      }

      // Reap after grace period
      setTimeout(async () => {
        await reapProcessTree(rootPid, reapedPids, reapErrors);
        try {
          if (rootPid > 0) process.kill(-rootPid, "SIGKILL");
        } catch (_err: unknown) {
          // Already dead
        }
        resolve({
          stdout,
          stderr,
          exitCode: 1,
          timedOut: true,
          reapedPids,
          reapErrors,
        });
      }, 500);
    }, options.timeoutMs);

    // Normal exit handler
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const exitCode = code ?? 1;

      // Immediately kill the entire process group to catch background children
      // Must happen quickly before the OS reparents orphans
      try {
        if (rootPid > 0) process.kill(-rootPid, "SIGTERM");
      } catch (_err: unknown) {
        // Process group may have already exited
      }

      // Wait for SIGTERM + reap grace, then verify cleanup
      setTimeout(async () => {
        // Force kill anything still alive in the process group
        try {
          if (rootPid > 0) process.kill(-rootPid, "SIGKILL");
        } catch (_err: unknown) {
          // Already dead
        }

        // Also reap via process tree as backup
        await reapProcessTree(rootPid, reapedPids, reapErrors);

        resolve({
          stdout,
          stderr,
          exitCode,
          timedOut: false,
          reapedPids,
          reapErrors,
        });
      }, options.reapGraceMs);
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reapErrors.push(err.message);
      resolve({
        stdout,
        stderr,
        exitCode: 1,
        timedOut: false,
        reapedPids,
        reapErrors,
      });
    });

    // Safety: if the child is somehow null
    if (!child.pid) {
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: "",
        stderr: "Failed to spawn subprocess",
        exitCode: 1,
        timedOut: false,
        reapedPids,
        reapErrors,
      });
    }
  });
}

/**
 * Reap any remaining descendant processes of the given root PID.
 * Uses the existing process-tree-cleaner infrastructure.
 */
async function reapProcessTree(
  rootPid: number,
  reapedPids: number[],
  reapErrors: string[],
): Promise<void> {
  if (rootPid <= 0) return;

  try {
    const descendants = await getDescendants(rootPid);
    if (descendants.length === 0) return;

    const result = await killProcessTree(rootPid, "SIGTERM", 1000);
    reapedPids.push(...result.killed);
    reapErrors.push(...result.failed.map((pid) => `Failed to kill PID ${pid}`));
  } catch (err) {
    reapErrors.push(`Reap error: ${err instanceof Error ? err.message : String(err)}`);
  }
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

      // 1b. Defense-in-depth: shell metachar detection
      const metacharReason = containsShellMetachars(command);
      if (metacharReason) {
        return {
          content: [{ type: "text" as const, text: metacharReason }],
          isError: true,
        };
      }

      // 2. Execute command with process tracking
      const execOpts = root ? { cwd: root.path } : undefined;
      const trackedResult = await execCommandTracked(command, {
        timeoutMs: timeout,
        reapGraceMs: 2000,
        ...execOpts,
      });

      // 3. Handle timeout
      if (trackedResult.timedOut) {
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

      // 4. Trim output — RTK-first with fallback to legacy trimmer
      const rtkAvailable = await isRtkAvailable();
      const trimmed = rtkAvailable
        ? await trimWithFallback(
            trackedResult.stdout,
            trackedResult.stderr,
            trackedResult.exitCode,
            rtkAvailable,
          )
        : trimCommandOutput(trackedResult.stdout, trackedResult.stderr, trackedResult.exitCode);
      return {
        content: [{ type: "text" as const, text: trimmed }],
        isError: trackedResult.exitCode !== 0,
      };
    },
  );
}
