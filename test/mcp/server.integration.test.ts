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

import { type ChildProcess, spawn } from "node:child_process";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";

const SERVER_PATH = resolve("dist/src/mcp/server.js");

/** Wait for a child process to exit, returning its exit code. */
function waitForExit(child: ChildProcess, timeoutMs = 5000): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Process did not exit within timeout"));
    }, timeoutMs);

    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

describe("forge-context MCP server integration", () => {
  let client: Client;
  let transport: StdioClientTransport;

  afterEach(async () => {
    try {
      await client?.close();
    } catch {
      // Ignore cleanup errors
    }
  });

  it("starts, registers core and typed tools, and executes forge_exec", {
    timeout: 15000,
  }, async () => {
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

    // 3. List tools — verify core tools and typed capability tools are registered
    const toolsResult = await client.listTools();
    const toolNames = toolsResult.tools.map((t) => t.name).sort();

    expect(toolNames).toEqual([
      "forge_artifact_query",
      "forge_check_command",
      "forge_diff_summary",
      "forge_dist_sync",
      "forge_docs_drift",
      "forge_exec",
      "forge_git",
      "forge_read",
      "forge_read_cached",
      "forge_review_context",
    ]);
    expect(toolsResult.tools).toHaveLength(10);

    // 4. Call forge_exec with `echo hello`
    const callResult = await client.callTool({
      name: "forge_exec",
      arguments: { command: "echo hello" },
    });

    // Verify response contains "hello"
    const content = callResult.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("text");
    expect(content[0].text).toContain("hello");
  });

  it("exits gracefully on SIGTERM", { timeout: 10000 }, async () => {
    const child = spawn("node", [SERVER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Wait for server to start (it writes to stderr on startup)
    await new Promise((resolve) => setTimeout(resolve, 500));

    child.kill("SIGTERM");

    const exitCode = await waitForExit(child);
    expect(exitCode).toBe(0);
  });

  it("exits when stdin is closed (parent process gone)", { timeout: 10000 }, async () => {
    const child = spawn("node", [SERVER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Close stdin — simulates parent process exit
    child.stdin!.end();

    const exitCode = await waitForExit(child);
    expect(exitCode).toBe(0);
  });

  it("rejects generic node execution through forge_exec", { timeout: 15000 }, async () => {
    // Process cleanup is covered by forge-exec-cleanup.test.ts. The MCP layer
    // must not expose generic node execution after P0-2 hardening.
    transport = new StdioClientTransport({
      command: "node",
      args: [SERVER_PATH],
      stderr: "pipe",
    });

    client = new Client({
      name: "forge-test-cleanup-client",
      version: "1.0.0",
    });
    await client.connect(transport);

    const callResult = await client.callTool({
      name: "forge_exec",
      arguments: {
        command:
          "node -e \"(require('child_process').spawn('sleep',['30'],{stdio:'ignore'}),console.log('bg-started'))\"",
        timeout: 10000,
      },
    });
    const content = callResult.content as Array<{ type: string; text: string }>;
    expect(callResult.isError).toBe(true);
    expect(content[0].text).toContain("Command not in allowlist");
  });
});
