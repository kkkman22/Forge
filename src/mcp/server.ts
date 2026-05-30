#!/usr/bin/env node
/**
 * forge-context MCP Server entry point.
 *
 * Registers three tools (forge_exec, forge_git, forge_read) and connects
 * via StdioServerTransport for communication with Claude Code.
 *
 * **Validates: Requirement 1**
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logResolvedRoot, resolveProjectRoot } from "./project-root.js";
import { registerForgeExec } from "./tools/forge-exec.js";
import { registerForgeGit } from "./tools/forge-git.js";
import { registerForgeRead } from "./tools/forge-read.js";
import { registerForgeReadCached } from "./tools/forge-read-cached.js";

// ---------------------------------------------------------------------------
// Error handling — log to stderr (stdout is reserved for MCP protocol)
// ---------------------------------------------------------------------------

process.on("unhandledRejection", (reason: unknown) => {
  // biome-ignore lint/suspicious/noConsole: top-level process error handler
  console.error("[forge-context] Unhandled rejection:", reason);
});

process.on("uncaughtException", (error: Error) => {
  // biome-ignore lint/suspicious/noConsole: top-level process error handler
  console.error("[forge-context] Uncaught exception:", error);
});

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "forge-context",
  version: "1.0.0",
});

// Resolve project root from CLAUDE_PROJECT_DIR or cwd
const root = resolveProjectRoot();
logResolvedRoot(root);

// Register tools with resolved root
registerForgeExec(server, root);
registerForgeGit(server, root);
registerForgeRead(server, root);
registerForgeReadCached(server, root);

// Connect via stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
