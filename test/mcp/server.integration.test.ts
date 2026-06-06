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

  it("starts, registers 4 tools, and executes forge_exec", { timeout: 15000 }, async () => {
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

    // 3. List tools — verify exactly 4 tools registered
    const toolsResult = await client.listTools();
    const toolNames = toolsResult.tools.map((t) => t.name).sort();

    expect(toolNames).toEqual(["forge_exec", "forge_git", "forge_read", "forge_read_cached"]);
    expect(toolsResult.tools).toHaveLength(4);

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

  it("cleans up tracked processes on stdin EOF", { timeout: 30000 }, async () => {
    // This test verifies that the ProcessRegistry cleanup runs during shutdown.
    // We spawn the server, start a long-running command via forge_exec, then close stdin.
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

    // Start a background sleep that will outlive the shell
    // Use node to spawn a long-lived child process, then exit quickly.
    // The orphaned child will be cleaned up by execCommandTracked.
    // Note: sh/bash/semicolons blocked by P0-2 allowlist; use comma operator instead.
    // No detached:true — child stays in parent's process group for reaping.
    const callResult = await client.callTool({
      name: "forge_exec",
      arguments: {
        command:
          "node -e \"(require('child_process').spawn('sleep',['30'],{stdio:'ignore'}),console.log('bg-started'))\"",
        timeout: 10000,
      },
    });
    const content = callResult.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain("bg-started");

    // Close the client — this closes stdin, triggering server shutdown
    await client.close();

    // Poll for cleanup completion (ProcessRegistry reap + shutdown)
    // Retry loop avoids race condition between server shutdown and pgrep check
    const { execFileSync } = await import("node:child_process");
    const maxAttempts = 8;
    const intervalMs = 500;
    let cleanedUp = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      try {
        execFileSync("pgrep", ["-f", "sleep 30"], { encoding: "utf-8" });
        // pgrep found a match — cleanup not done yet
      } catch {
        // pgrep returns non-zero when no processes match — cleanup complete
        cleanedUp = true;
        break;
      }
    }

    expect(cleanedUp).toBe(true);
  });
});
