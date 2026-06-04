#!/usr/bin/env node
/**
 * forge-context MCP Server entry point.
 *
 * Registers four tools (forge_exec, forge_git, forge_read, forge_read_cached)
 * and connects via StdioServerTransport for communication with Claude Code.
 *
 * Includes graceful shutdown handling (SIGTERM, SIGINT, stdin EOF) to prevent
 * orphan processes when the parent (Claude Code) exits.
 *
 * **Validates: Requirement 1**
 */
export {};
