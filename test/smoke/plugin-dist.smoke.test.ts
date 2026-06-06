/**
 * Smoke tests for plugin dist package structure (P2-4).
 *
 * Verifies that dist-plugin/ contains all required files
 * and the MCP server is properly declared.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const DIST_PLUGIN = join(ROOT, "dist-plugin");

describe("plugin dist structure smoke tests", () => {
  it("dist-plugin directory exists", () => {
    expect(existsSync(DIST_PLUGIN)).toBe(true);
  });

  it("hooks/hooks.json exists", () => {
    expect(existsSync(join(DIST_PLUGIN, "hooks/hooks.json"))).toBe(true);
  });

  it("hooks/hooks.json is valid JSON with at least one hook", () => {
    const content = readFileSync(join(DIST_PLUGIN, "hooks/hooks.json"), "utf-8");
    const parsed = JSON.parse(content);
    // Structure: { hooks: { SessionStart: [...], PreToolUse: [...], ... } }
    const hooksObj = parsed.hooks ?? parsed;
    const hookArrays = Object.values(hooksObj).filter(Array.isArray) as unknown[][];
    const totalHooks = hookArrays.reduce((sum, arr) => sum + arr.length, 0);
    expect(totalHooks).toBeGreaterThan(0);
  });

  it("dist/src/mcp/server.js exists in plugin package", () => {
    expect(existsSync(join(DIST_PLUGIN, "dist/src/mcp/server.js"))).toBe(true);
  });

  it("MCP server is declared in .mcp.json or plugin.json", () => {
    const mcpJsonPath = join(DIST_PLUGIN, ".mcp.json");
    const pluginJsonPath = join(DIST_PLUGIN, ".claude-plugin/plugin.json");

    if (existsSync(mcpJsonPath)) {
      const content = readFileSync(mcpJsonPath, "utf-8");
      const mcp = JSON.parse(content);
      expect(mcp.mcpServers ?? mcp["mcp-servers"]).toBeDefined();
      return;
    }

    if (existsSync(pluginJsonPath)) {
      const content = readFileSync(pluginJsonPath, "utf-8");
      const plugin = JSON.parse(content);
      // Plugin may declare MCP via mcpServers or similar
      expect(plugin.mcpServers ?? plugin["mcp-servers"]).toBeDefined();
      return;
    }

    expect.unreachable("Neither .mcp.json nor .claude-plugin/plugin.json found in dist-plugin");
  });

  it("skills directory exists", () => {
    expect(existsSync(join(DIST_PLUGIN, "skills"))).toBe(true);
  });

  it("agents directory exists", () => {
    expect(existsSync(join(DIST_PLUGIN, "agents"))).toBe(true);
  });

  it("commands directory exists", () => {
    expect(existsSync(join(DIST_PLUGIN, "commands"))).toBe(true);
  });
});
