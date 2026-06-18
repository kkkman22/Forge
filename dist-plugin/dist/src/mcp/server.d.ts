#!/usr/bin/env node
/**
 * forge-context MCP Server entry point.
 *
 * Registers three tools (forge_exec, forge_git, forge_read)
 * and connects via StdioServerTransport for communication with Claude Code.
 *
 * Includes graceful shutdown handling (SIGTERM, SIGINT, stdin EOF) to prevent
 * orphan processes when the parent (Claude Code) exits.
 *
 * **Validates: Requirement 1**
 */
export {};
