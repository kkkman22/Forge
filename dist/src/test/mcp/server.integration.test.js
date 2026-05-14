/**
 * Integration test for the forge-context MCP server.
 *
 * Spawns the compiled server as a child process, communicates via the MCP SDK
 * client transport, and verifies:
 *   - Server starts and responds to MCP initialize handshake
 *   - tools/list returns exactly 3 tools (forge_exec, forge_git, forge_read)
 *   - tools/call for forge_exec with `echo hello` returns "hello"
 *
 * **Validates: Requirements 1.1–1.4, 1.6**
 */
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";
const SERVER_PATH = resolve("dist/src/mcp/server.js");
describe("forge-context MCP server integration", () => {
    let client;
    let transport;
    afterEach(async () => {
        try {
            await client?.close();
        }
        catch {
            // Ignore cleanup errors
        }
    });
    it("starts, registers 3 tools, and executes forge_exec", { timeout: 15000 }, async () => {
        // 1. Create client transport pointing to the compiled server
        transport = new StdioClientTransport({
            command: "node",
            args: [SERVER_PATH],
            stderr: "pipe",
        });
        client = new Client({
            name: "forge-test-client",
            version: "1.0.0",
        });
        // 2. Connect — this sends initialize + initialized handshake
        await client.connect(transport);
        // 3. List tools — verify exactly 3 tools registered
        const toolsResult = await client.listTools();
        const toolNames = toolsResult.tools.map((t) => t.name).sort();
        expect(toolNames).toEqual(["forge_exec", "forge_git", "forge_read"]);
        expect(toolsResult.tools).toHaveLength(3);
        // 4. Call forge_exec with `echo hello`
        const callResult = await client.callTool({
            name: "forge_exec",
            arguments: { command: "echo hello" },
        });
        // Verify response contains "hello"
        const content = callResult.content;
        expect(content).toHaveLength(1);
        expect(content[0].type).toBe("text");
        expect(content[0].text).toContain("hello");
    });
});
//# sourceMappingURL=server.integration.test.js.map