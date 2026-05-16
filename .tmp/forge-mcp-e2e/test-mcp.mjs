#!/usr/bin/env node
// E2E smoke test: spawn the bundled forge-context MCP server and call
// forge_git(diff-content) over stdio. Validates that the binary shipped
// with the plugin works end-to-end.

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const SERVER = process.env.FORGE_MCP_SERVER ||
  `${process.env.HOME}/.claude/plugins/cache/forge-official/forge/2.4.0/dist/src/mcp/server.js`;

function jsonrpc(id, method, params) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

async function main() {
  const child = spawn("node", [SERVER], {
    cwd: "/Users/king/code/Forge",
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdoutBuf = "";
  let stderrBuf = "";
  child.stdout.on("data", (chunk) => { stdoutBuf += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderrBuf += chunk.toString(); });

  function send(payload) {
    child.stdin.write(payload + "\n");
  }

  // 1. initialize
  send(jsonrpc(1, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "e2e-test", version: "1.0.0" },
  }));

  await sleep(400);

  // 2. tools/list to confirm forge_git exists
  send(jsonrpc(2, "tools/list", {}));
  await sleep(400);

  // 3. call forge_git(diff-content)
  send(jsonrpc(3, "tools/call", {
    name: "forge_git",
    arguments: { subcommand: "diff-content", args: "HEAD~1...HEAD" },
  }));
  await sleep(2000);

  child.stdin.end();
  child.kill();

  const lines = stdoutBuf.trim().split("\n");
  const responses = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

  const init = responses.find(r => r.id === 1);
  const list = responses.find(r => r.id === 2);
  const call = responses.find(r => r.id === 3);

  console.log("=== Initialize ===");
  console.log(init ? `✅ protocolVersion: ${init.result?.protocolVersion}` : "❌ no init response");

  console.log("\n=== tools/list ===");
  if (list?.result?.tools) {
    const names = list.result.tools.map(t => t.name);
    console.log(`✅ tools: ${names.join(", ")}`);
    console.log(`  forge_git present: ${names.includes("forge_git") ? "✅" : "❌"}`);
  } else {
    console.log("❌ no tools/list response");
  }

  console.log("\n=== forge_git(diff-content) ===");
  if (call?.result?.content) {
    const text = call.result.content[0]?.text || "";
    console.log(`✅ response (${text.length} chars):`);
    console.log(text.split("\n").slice(0, 8).join("\n"));
    console.log(text.length > 200 ? "... (truncated for display)" : "");
  } else if (call?.error) {
    console.log(`❌ error: ${call.error.message}`);
  } else {
    console.log("❌ no tools/call response");
  }

  if (stderrBuf.trim()) {
    console.log("\n=== stderr ===");
    console.log(stderrBuf.trim().split("\n").slice(0, 5).join("\n"));
  }
}

main().catch(err => {
  console.error("test failed:", err);
  process.exit(1);
});
