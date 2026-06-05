/**
 * forge_read — batch file analysis via sandboxed script execution.
 *
 * Executes a user-provided script in a child subprocess with file paths
 * injected via the `FORGE_FILES` environment variable (JSON array).
 * Only the script's stdout is returned — file contents never enter the context.
 *
 * Supported languages:
 *   - javascript: `node -e "<script>"` with FORGE_FILES env var
 *   - shell: `/bin/sh -c "<script>"` with FORGE_FILES env var
 *
 * **Validates: Requirement 4**
 */

import { execFile } from "node:child_process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ResolvedRoot } from "../project-root.js";
import { validatePaths } from "./path-validator.js";

// Re-export for backward compatibility with existing imports
export { validatePaths } from "./path-validator.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default timeout for script execution (30 seconds). */
const DEFAULT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Security: script validation
// ---------------------------------------------------------------------------

/** Dangerous Node.js API patterns that should not appear in user scripts. */
const DANGEROUS_SCRIPT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /child_process/, label: "child_process" },
  { pattern: /process\.exit/, label: "process.exit" },
  { pattern: /eval\s*\(/, label: "eval()" },
  { pattern: /Function\s*\(/, label: "Function()" },
  { pattern: /writeFileSync/, label: "writeFileSync" },
  { pattern: /writeFile\b/, label: "writeFile" },
  { pattern: /appendFileSync/, label: "appendFileSync" },
  { pattern: /appendFile\b/, label: "appendFile" },
  { pattern: /unlinkSync/, label: "unlinkSync" },
  { pattern: /unlink\b/, label: "unlink" },
  { pattern: /rmSync/, label: "rmSync" },
  { pattern: /rmdir\b/, label: "rmdir" },
  { pattern: /renameSync/, label: "renameSync" },
  { pattern: /rename\b/, label: "rename" },
  { pattern: /chmodSync/, label: "chmodSync" },
  { pattern: /chownSync/, label: "chownSync" },
  { pattern: /execSync/, label: "execSync" },
  { pattern: /spawnSync/, label: "spawnSync" },
  { pattern: /execFileSync/, label: "execFileSync" },
  { pattern: /mkdirSync/, label: "mkdirSync" },
  { pattern: /mkdir\b/, label: "mkdir" },
];

/**
 * Validate that a script does not contain dangerous patterns.
 * Returns an error message if dangerous, or null if safe.
 */
export function validateScript(script: string): string | null {
  for (const { pattern, label } of DANGEROUS_SCRIPT_PATTERNS) {
    if (pattern.test(script)) {
      return `Script contains dangerous pattern: ${label}`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Subprocess execution
// ---------------------------------------------------------------------------

export interface ReadExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

/**
 * Execute a script in a child subprocess with FORGE_FILES env var injection.
 *
 * @param script - The script code to execute
 * @param language - "javascript" or "shell"
 * @param paths - File paths to inject via FORGE_FILES env var
 * @param timeoutMs - Timeout in milliseconds
 */
export function execReadScript(
  script: string,
  language: "javascript" | "shell",
  paths: string[],
  timeoutMs: number,
  options?: { cwd?: string },
): Promise<ReadExecResult> {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      FORGE_FILES: JSON.stringify(paths),
    };

    const cmd = language === "javascript" ? "node" : "/bin/sh";
    const args = language === "javascript" ? ["-e", script] : ["-c", script];

    const child = execFile(
      cmd,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        env,
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
        resolve({
          stdout: String(stdout),
          stderr: String(stderr),
          exitCode,
          timedOut: false,
        });
      },
    );

    // Safety: if the child is somehow null, resolve immediately
    if (!child) {
      resolve({
        stdout: "",
        stderr: "Failed to spawn subprocess",
        exitCode: 1,
        timedOut: false,
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

const TOOL_DESCRIPTION = [
  "Analyze multiple files through a sandboxed script execution.",
  "",
  "File paths are injected via the FORGE_FILES environment variable (JSON array).",
  "The script reads files and outputs analysis results to stdout.",
  "Only stdout is returned — file contents never enter the context window.",
  "",
  "Languages:",
  "- javascript: runs via `node -e`, access paths via JSON.parse(process.env.FORGE_FILES)",
  "- shell: runs via `/bin/sh -c`, access paths via $FORGE_FILES",
  "",
  "Use for: batch structural analysis, dependency graphs, code metrics.",
  "NOT for: file mutations or interactive commands.",
].join("\n");

/**
 * Register the `forge_read` tool on the given MCP server.
 */
export function registerForgeRead(server: McpServer, root?: ResolvedRoot): void {
  server.registerTool(
    "forge_read",
    {
      description: TOOL_DESCRIPTION,
      inputSchema: {
        paths: z.array(z.string()).describe("File paths to analyze"),
        script: z.string().describe("Analysis script code"),
        language: z
          .enum(["javascript", "shell"])
          .default("javascript")
          .describe("Script language (javascript or shell)"),
      },
      _meta: {
        "anthropic/maxResultSizeChars": 200_000,
      },
    },
    async ({ paths, script, language }) => {
      // Security: validate paths stay within project root
      if (root) {
        const pathError = validatePaths(paths, root.path);
        if (pathError) {
          return {
            content: [{ type: "text" as const, text: pathError }],
            isError: true,
          };
        }
      }

      // Security: validate script for dangerous patterns (javascript only)
      if (language === "javascript") {
        const scriptError = validateScript(script);
        if (scriptError) {
          return {
            content: [{ type: "text" as const, text: scriptError }],
            isError: true,
          };
        }
      }

      // Execute script with FORGE_FILES env var
      const readOpts = root ? { cwd: root.path } : undefined;
      const result = await execReadScript(script, language, paths, DEFAULT_TIMEOUT_MS, readOpts);

      // Handle timeout
      if (result.timedOut) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Script timed out after ${DEFAULT_TIMEOUT_MS}ms`,
            },
          ],
          isError: true,
        };
      }

      // Handle non-zero exit
      if (result.exitCode !== 0) {
        const errOutput = result.stderr
          ? `${result.stdout}\n\nSTDERR:\n${result.stderr}`
          : result.stdout || "Script failed with no output";
        return {
          content: [{ type: "text" as const, text: errOutput }],
          isError: true,
        };
      }

      // Return only stdout — output isolation
      return {
        content: [{ type: "text" as const, text: result.stdout }],
      };
    },
  );
}
