/**
 * Integration test for the tinkerman-context MCP server.
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

/**
 * Marker the server writes to stderr once it has fully started — i.e. the
 * stdio transport is live and pumping. By the time this line appears, the
 * SIGTERM/SIGINT/stdin handlers are registered AND `server.connect()` has
 * settled, so the process is in a stable state ready to be signaled. Waiting
 * on this marker makes shutdown tests deterministic instead of racing the
 * init window between the earlier "resolved project root" line and the
 * transport becoming ready (which can leave SIGTERM killing the process
 * with a null exit code).
 */
const READY_MARKER = "[tinkerman-context] ready";

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

/**
 * Resolve once the server has fully started — signalled by the
 * `[tinkerman-context] ready` stderr line emitted after `server.connect()`.
 * Fails loudly (rather than hanging) if the marker never arrives or the
 * process exits first.
 */
function waitForReady(child: ChildProcess, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Server did not emit "${READY_MARKER}" within ${timeoutMs}ms`));
    }, timeoutMs);

    child.stderr?.on("data", (chunk: Buffer) => {
      if (chunk.includes(READY_MARKER)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("exit", () => {
      clearTimeout(timer);
      reject(new Error("Server exited before signalling ready"));
    });
  });
}

describe("tinkerman-context MCP server integration", () => {
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
      "forge_review_context",
    ]);
    expect(toolsResult.tools).toHaveLength(9);

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

    // Wait until the server has registered its signal handlers, then signal it.
    await waitForReady(child);
    child.kill("SIGTERM");

    const exitCode = await waitForExit(child);
    expect(exitCode).toBe(0);
  });

  it("exits when stdin is closed (parent process gone)", { timeout: 10000 }, async () => {
    const child = spawn("node", [SERVER_PATH], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Wait until the server is ready before simulating parent exit.
    await waitForReady(child);

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
