#!/usr/bin/env node
/**
 * tinkerman-context MCP Server entry point.
 *
 * Registers three tools (forge_exec, forge_git, forge_read)
 * and connects via StdioServerTransport for communication with Claude Code.
 *
 * Includes graceful shutdown handling (SIGTERM, SIGINT, stdin EOF) to prevent
 * orphan processes when the parent (Claude Code) exits.
 *
 * **Validates: Requirement 1**
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ProcessRegistry } from "../process-registry.js";
import { logResolvedRoot, resolveProjectRoot } from "./project-root.js";
import { registerForgeExec } from "./tools/forge-exec.js";
import { registerForgeGit } from "./tools/forge-git.js";
import { registerForgeRead } from "./tools/forge-read.js";
import { registerTypedCapabilityTools } from "./tools/typed-capabilities.js";

// ---------------------------------------------------------------------------
// Error handling — log to stderr (stdout is reserved for MCP protocol)
// ---------------------------------------------------------------------------

process.on("unhandledRejection", (reason: unknown) => {
  // biome-ignore lint/suspicious/noConsole: top-level process error handler
  console.error("[tinkerman-context] Unhandled rejection:", reason);
});

process.on("uncaughtException", (error: Error) => {
  // biome-ignore lint/suspicious/noConsole: top-level process error handler
  console.error("[tinkerman-context] Uncaught exception:", error);
});

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "tinkerman-context",
  version: "1.0.0",
});

// Resolve project root from CLAUDE_PROJECT_DIR or cwd
const root = resolveProjectRoot();
logResolvedRoot(root);

// Register tools with resolved root
registerForgeExec(server, root);
registerForgeGit(server, root);
registerForgeRead(server, root);
registerTypedCapabilityTools(server, root);

// ---------------------------------------------------------------------------
// Graceful shutdown — prevents orphan processes when Claude Code exits
// ---------------------------------------------------------------------------

const FORCE_EXIT_TIMEOUT_MS = 8000;
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  const forceTimer = setTimeout(() => {
    // biome-ignore lint/suspicious/noConsole: shutdown timeout
    console.error(
      `[tinkerman-context] Forced exit: shutdown timed out after ${FORCE_EXIT_TIMEOUT_MS}ms (${signal})`,
    );
    process.exit(1);
  }, FORCE_EXIT_TIMEOUT_MS);

  try {
    // Clean up tracked processes first
    const registry = ProcessRegistry.getInstance();
    if (registry.size() > 0) {
      const cleanupResult = await registry.shutdownAll(3000);
      // biome-ignore lint/suspicious/noConsole: shutdown diagnostic
      console.error(
        `[tinkerman-context] Process registry cleanup: terminated=${cleanupResult.terminated} forcedKill=${cleanupResult.forcedKill} alreadyExited=${cleanupResult.alreadyExited} errors=${cleanupResult.errors.length}`,
      );
    }

    await server.close();
    clearTimeout(forceTimer);
    process.exit(0);
  } catch (err) {
    clearTimeout(forceTimer);
    // biome-ignore lint/suspicious/noConsole: shutdown error
    console.error(`[tinkerman-context] Error during shutdown (${signal}):`, err);
    process.exit(1);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.stdin.on("end", () => gracefulShutdown("stdin EOF"));
process.stdin.on("error", () => gracefulShutdown("stdin error"));

// ---------------------------------------------------------------------------
// Connect via stdio transport
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);

// Emit a readiness marker AFTER the transport is live. Signal handlers are
// registered above and the stdio reader is now pumping, so the process is in a
// stable state — tests and supervisors can wait on this line before sending
// SIGTERM/SIGINT instead of racing against a fixed sleep.
// biome-ignore lint/suspicious/noConsole: readiness marker for tests/supervisors
console.error(`[tinkerman-context] ready (pid=${process.pid})`);
