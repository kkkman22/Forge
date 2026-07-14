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
// Readonly command allowlist (P0-2 primary security boundary)
// ---------------------------------------------------------------------------

const EXACT_ALLOWED_COMMANDS: ReadonlySet<string> = new Set([
  "npm test",
  "npm run test",
  "npm run test:e2e",
  "npm run test:coverage",
  "npm run typecheck",
  "npm run lint",
  "npm run check",
  "vitest run",
  "tsc --noEmit",
  "biome check src/ test/",
  "echo hello",
]);

const ALLOWED_NPM_RUN_SCRIPTS: ReadonlySet<string> = new Set([
  "test",
  "test:e2e",
  "test:coverage",
  "typecheck",
  "lint",
  "check",
]);

const ALLOWED_GIT_SUBCOMMANDS: ReadonlySet<string> = new Set([
  "status",
  "diff",
  "log",
  "show",
  "rev-parse",
  "ls-files",
  "ls-tree",
]);

/**
 * Flags that cause a runner binary (vitest/npx/biome) to load and execute an
 * attacker-controlled module — defeating the "readonly" promise of the
 * allowlist. P2-2: the prefix-match branches conceded arbitrary trailing
 * args; `vitest run --config /tmp/x.mjs` loads x.mjs as a module and runs its
 * top-level code → RCE.
 *
 * Matched as bare flag (== / startsWith "--flag=") so both `--config x` and
 * `--config=x` forms are rejected.
 */
const BLOCKED_RUNNER_FLAGS: ReadonlySet<string> = new Set([
  "--config",
  "-c",
  "--loader",
  "--project",
  "--config-path",
  "--extends",
]);

function hasBlockedRunnerFlag(parts: string[]): boolean {
  return parts.some((p) => {
    if (p.startsWith("--") && p.includes("=")) {
      return BLOCKED_RUNNER_FLAGS.has(p.split("=")[0]);
    }
    return BLOCKED_RUNNER_FLAGS.has(p);
  });
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

/**
 * Check if a command is in the readonly allowlist.
 * This is the primary security boundary — settings.json deny is supplementary.
 */
export function isCommandAllowed(command: string): boolean {
  const trimmed = normalizeCommand(command);
  if (trimmed.length === 0) return false;
  const parts = trimmed.split(/\s+/);
  const bin = parts[0];

  if (EXACT_ALLOWED_COMMANDS.has(trimmed)) return true;

  if (bin === "npm") {
    if (parts.length === 2 && parts[1] === "test") return true;
    if (parts.length === 3 && parts[1] === "run") {
      return ALLOWED_NPM_RUN_SCRIPTS.has(parts[2]);
    }
    return false;
  }

  if (bin === "npx") {
    return (
      parts.length >= 3 &&
      parts[1] === "vitest" &&
      parts[2] === "run" &&
      !hasBlockedRunnerFlag(parts)
    );
  }

  if (bin === "vitest") {
    return parts.length >= 2 && parts[1] === "run" && !hasBlockedRunnerFlag(parts);
  }

  if (bin === "tsc") {
    return parts.length === 2 && parts[1] === "--noEmit";
  }

  if (bin === "biome") {
    return (
      parts.length >= 2 &&
      parts[1] === "check" &&
      !parts.includes("--write") &&
      !hasBlockedRunnerFlag(parts)
    );
  }

  if (bin === "git") {
    if (parts.length < 2) return false;
    const sub = parts[1];
    if (!ALLOWED_GIT_SUBCOMMANDS.has(sub)) return false;
    return !parts.some((part) => part === "--output" || part.startsWith("--output="));
  }

  return false;
}

// ---------------------------------------------------------------------------
// Git-argument denylist (P2-1)
// ---------------------------------------------------------------------------
//
// `forge_git` interpolates a caller-controlled `args` string into git
// subcommands (diff / log / status). Shell-metachar detection catches
// chaining/substitution, but several git flags enable arbitrary file
// read/write or code execution without any shell operator and slip past the
// metachar guard:
//   --no-index <a> <b>   dumps arbitrary files (no git repo needed)
//   --output <path>      writes git output to an arbitrary path
//   -O / --output-indicator  alias forms of --output
//   --ext-diff           invokes an external diff driver (config-controlled RCE)
//   -c key=val           injects git config (core.pager etc.) — safe only when
//                        placed before the subcommand; `git log -c ...` is a
//                        no-op for config, but block defensively.
//
// forge_exec's allowlist already blocks `--output` on its own git branch
// (line ~172); this shared validator extends the same protection to the
// forge_git `args` path, which bypasses isCommandAllowed entirely.

const BLOCKED_GIT_FLAGS: readonly string[] = [
  "--no-index",
  "--output",
  "--output-indicator",
  "--ext-diff",
  "-c",
  "-O",
];

/**
 * Reject git arguments that enable arbitrary read/write/execution even though
 * they contain no shell metacharacter. Returns a human-readable rejection
 * reason, or null if the args pass the denylist.
 *
 * Exported so forge_git and forge_exec share one source of truth for git-arg
 * safety.
 * @public
 */
export function validateGitArgs(args: string): string | null {
  const tokens = args.trim().split(/\s+/);
  for (const tok of tokens) {
    const bare = tok.startsWith("--") ? tok.split("=")[0] : tok;
    if (BLOCKED_GIT_FLAGS.includes(bare) || BLOCKED_GIT_FLAGS.includes(tok)) {
      return `git argument denied (file read/write / config injection vector): ${tok}`;
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
  { pattern: /\$/, label: "$" },
  { pattern: /\n/, label: "newline" },
  { pattern: /\r/, label: "carriage-return" },
  // P0-2 fix: expanded to cover all shell operators
  { pattern: /;/, label: ";" },
  { pattern: /&&/, label: "&&" },
  { pattern: /\|\|/, label: "||" },
  { pattern: /\|/, label: "|" },
  { pattern: />/, label: ">" },
  { pattern: /</, label: "<" },
  { pattern: /&/, label: "&" },
];

/**
 * Detect shell metacharacters that could enable command injection.
 * Returns the metachar label if found, or null if the command appears safe.
 *
 * P0-2 fix: now flags ALL shell operators (;, &, |, >, <, &&, ||, >>) and
 * command substitution ($() and ``) as defense-in-depth. Even though
 * forge_exec invokes via `sh -c`, these operators enable chaining arbitrary
 * commands which is unsafe for a readonly tool.
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

function splitSimpleCommand(command: string): { bin: string; args: string[] } {
  const parts = command.trim().split(/\s+/);
  return { bin: parts[0], args: parts.slice(1) };
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

export interface LegacyTypedReplacementWarning {
  code: "LEGACY_TYPED_REPLACEMENT_AVAILABLE";
  replacement: "forge_docs_drift" | "forge_dist_sync";
  message: string;
}

export function legacyTypedReplacementWarning(
  command: string,
): LegacyTypedReplacementWarning | null {
  const normalized = normalizeCommand(command);
  if (normalized === "npm run docs:check") {
    return {
      code: "LEGACY_TYPED_REPLACEMENT_AVAILABLE",
      replacement: "forge_docs_drift",
      message: "Typed MCP capability available: use forge_docs_drift instead of forge_exec.",
    };
  }
  if (normalized === "node scripts/check-dist-sync.mjs") {
    return {
      code: "LEGACY_TYPED_REPLACEMENT_AVAILABLE",
      replacement: "forge_dist_sync",
      message: "Typed MCP capability available: use forge_dist_sync instead of forge_exec.",
    };
  }
  return null;
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
    // Simple commands split into [bin, ...args] and exec directly (no shell,
    // no injection surface); complex commands fall back to /bin/sh -c.
    // Mirrors the spawnTarget pattern used by execCommandTracked.
    const target = isSimpleCommand(command)
      ? splitSimpleCommand(command)
      : { bin: "/bin/sh", args: ["-c", command] };
    const child = execFile(
      target.bin,
      target.args,
      {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        ...(options?.cwd ? { cwd: options.cwd } : {}),
      },
      (error, stdout, stderr) => {
        if (error && "killed" in error && error.killed) {
          resolve({
            stdout: String(stdout),
            stderr: String(stderr),
            exitCode: 1,
            timedOut: true,
          });
          return;
        }
        const exitCode = error && "code" in error ? ((error.code as number) ?? 1) : 0;
        resolve({ stdout: String(stdout), stderr: String(stderr), exitCode, timedOut: false });
      },
    );
    if (!child) {
      resolve({ stdout: "", stderr: "Failed to spawn subprocess", exitCode: 1, timedOut: false });
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
    const spawnTarget = isSimpleCommand(command)
      ? splitSimpleCommand(command)
      : { bin: "/bin/sh", args: ["-c", command] };

    const child = spawn(spawnTarget.bin, spawnTarget.args, {
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
      // 1a. Primary security: hardcoded allowlist
      if (!isCommandAllowed(command)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Command not in allowlist: ${command.trim().split(/\s+/)[0]}`,
            },
          ],
          isError: true,
        };
      }

      // 1. Check deny rules (supplementary layer)
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

      // 4. Trim output — failure passthrough (Iron Law) + key-line fallback for large success output.
      // Large success output compression is delegated to Headroom (HTTP layer) when present;
      // this trimmer is the Headroom-absent fallback.
      const trimmed = trimCommandOutput(
        trackedResult.stdout,
        trackedResult.stderr,
        trackedResult.exitCode,
      );
      const legacyWarning = legacyTypedReplacementWarning(command);
      return {
        content: [
          {
            type: "text" as const,
            text: legacyWarning
              ? `[${legacyWarning.code}] ${legacyWarning.message}\n${trimmed}`
              : trimmed,
          },
        ],
        isError: trackedResult.exitCode !== 0,
      };
    },
  );
}
