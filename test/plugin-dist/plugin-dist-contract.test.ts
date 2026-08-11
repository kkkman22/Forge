import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FORGE_ROOT = join(import.meta.dirname, "../..");
const PLUGIN_DIST = join(FORGE_ROOT, "dist-plugin");

describe("plugin dist contract", () => {
  it("contains hooks/hooks.json", () => {
    expect(existsSync(join(PLUGIN_DIST, "hooks/hooks.json"))).toBe(true);
  });

  it("contains .mcp.json or MCP manifest in plugin config", () => {
    // Either .mcp.json in root or MCP config in .claude-plugin/plugin.json
    const hasMcpJson = existsSync(join(PLUGIN_DIST, ".mcp.json"));
    const hasPluginJson = existsSync(join(PLUGIN_DIST, ".claude-plugin/plugin.json"));
    expect(hasMcpJson || hasPluginJson).toBe(true);
  });

  it("hooks.json contains at least one hook", async () => {
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(join(PLUGIN_DIST, "hooks/hooks.json"), "utf-8");
    const parsed = JSON.parse(content) as {
      hooks: Record<string, Array<{ hooks: Array<unknown> }>>;
    };
    const hooksSection = parsed.hooks;
    expect(hooksSection).toBeDefined();
    const hookCount = Object.values(hooksSection)
      .flat()
      .reduce((sum, group) => sum + (Array.isArray(group.hooks) ? group.hooks.length : 0), 0);
    expect(hookCount).toBeGreaterThan(0);
  });

  it("contains Tinkerman runtime worker scripts", () => {
    expect(existsSync(join(PLUGIN_DIST, "scripts/tinkerman-hook-dispatch.mjs"))).toBe(true);
    expect(existsSync(join(PLUGIN_DIST, "scripts/tinkerman-phase-worker.mjs"))).toBe(true);
    expect(existsSync(join(PLUGIN_DIST, "scripts/tinkerman-sync-runtime.mjs"))).toBe(true);
  });

  it("packages the /tinkerman phase worker runtime contract", async () => {
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(join(PLUGIN_DIST, "skills/tinkerman/SKILL.md"), "utf-8");

    expect(content).toContain("Phase Worker Runtime");
    expect(content).toContain("No manual new Claude Code window");
    expect(content).toContain("tinkerman-phase-worker.mjs");
    expect(content).toContain("tinkerman-sync-runtime.mjs");
  });

  it("packages an automatic runtime sync hook", async () => {
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(join(PLUGIN_DIST, "hooks/hooks.json"), "utf-8");

    expect(content).toContain("tinkerman-sync-runtime.mjs");
    expect(content).toContain("--repair");
    expect(content).toContain("CLAUDE_PLUGIN_ROOT");
  });
});
