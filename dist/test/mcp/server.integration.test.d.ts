/**
 * Integration test for the forge-context MCP server.
 *
 * Spawns the compiled server as a child process, communicates via the MCP SDK
 * client transport, and verifies:
 *   - Server starts and responds to MCP initialize handshake
 *   - tools/list returns core MCP tools plus typed Forge capability tools
 *   - tools/call for forge_exec with `echo hello` returns "hello"
 *
 * **Validates: Requirements 1.1–1.4, 1.6**
 */
export {};
