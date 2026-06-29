/**
 * Smoke tests for plugin dist package structure (P2-4).
 *
 * Verifies that dist-plugin/ contains all required files
 * and the MCP server is properly declared.
 *
 * Also covers packs-plugin-distribution (slice A', T7): the plugin install
 * path must carry packs/ so `/forge init --pack pms` works without the
 * "功能将不可用" lie, and running the bundled init.sh against this bundle as
 * CLAUDE_PLUGIN_ROOT must activate the pack + emit telemetry.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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

  it("all hook-referenced scripts are packaged in dist-plugin", () => {
    const content = readFileSync(join(DIST_PLUGIN, "hooks/hooks.json"), "utf-8");
    const missingScripts: string[] = [];

    for (const match of content.matchAll(/scripts\/([A-Za-z0-9_./-]+)/g)) {
      const scriptPath = join(DIST_PLUGIN, "scripts", match[1]);
      if (!existsSync(scriptPath)) {
        missingScripts.push(`scripts/${match[1]}`);
      }
    }

    expect(missingScripts).toEqual([]);
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

  // ── packs-plugin-distribution (slice A', REQ-01/02/03) ──
  it("packs/pms/ shipped in dist-plugin (REQ-01)", () => {
    expect(existsSync(join(DIST_PLUGIN, "packs/pms/pack.yaml"))).toBe(true);
    expect(existsSync(join(DIST_PLUGIN, "packs/pms/contexts"))).toBe(true);
    expect(existsSync(join(DIST_PLUGIN, "packs/pms/state-machines"))).toBe(true);
    expect(existsSync(join(DIST_PLUGIN, "packs/pms/utils/business-day-clock.ts"))).toBe(true);
  });

  it("sample pack + *.test.ts excluded from dist-plugin", () => {
    expect(existsSync(join(DIST_PLUGIN, "packs/pms-marriott-sample"))).toBe(false);
    expect(existsSync(join(DIST_PLUGIN, "packs/pms/utils/business-day-clock.test.ts"))).toBe(false);
  });

  it("packs/manifest.json shipped and lists pms (REQ-03)", () => {
    const m = JSON.parse(readFileSync(join(DIST_PLUGIN, "packs/manifest.json"), "utf-8"));
    expect(m.packs).toBeInstanceOf(Array);
    expect(m.packs.some((p: { name: string }) => p.name === "pms")).toBe(true);
  });

  it("packs/README.md shipped with optional/ignore note (REQ-02)", () => {
    const r = readFileSync(join(DIST_PLUGIN, "packs/README.md"), "utf-8");
    expect(r).toMatch(/pms/i);
    expect(r).toMatch(/可忽略|可选/);
  });

  // ── T7 core-fix e2e: real bundled init.sh, CLAUDE_PLUGIN_ROOT = dist-plugin ──
  // The lie bug: plugin users ran `/forge init --pack pms` and got a silent
  // "功能将不可用" warn because the bundle had no packs/. Now it must activate.
  it("e2e: bundled init.sh --pack pms activates pack, no lie warn, emits telemetry", () => {
    const initSh = join(DIST_PLUGIN, "scripts/init.sh");
    expect(existsSync(initSh)).toBe(true);

    const proj = mkdtempSync(join(tmpdir(), "forge-plugin-e2e-"));
    const r = spawnSync(
      "bash",
      [
        initSh,
        "--non-interactive",
        "--name",
        "plug-e2e",
        "--stack",
        "TypeScript",
        "--security",
        "1",
        "--no-ultrareview",
        "--pack",
        "pms",
      ],
      { cwd: proj, env: { ...process.env, CLAUDE_PLUGIN_ROOT: DIST_PLUGIN }, encoding: "utf-8" },
    );
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    // init may exit nonzero for unrelated reasons (e.g. recipe detection);
    // the pack-specific assertions below are what we gate on.
    expect(out).not.toContain("功能将不可用");
    expect(out).toContain("PMS Pack");
    // Telemetry is mandatory in the plugin e2e (pack_source is deterministically
    // 'plugin' here). An unconditional assert closes the vacuous-pass gap (Q-003).
    const th = join(proj, ".forge/knowledge/tool-health.md");
    expect(existsSync(th), `telemetry file missing: ${th}`).toBe(true);
    const t = readFileSync(th, "utf-8");
    expect(t).toMatch(/pack-enabled/);
    expect(t).toMatch(/name=pms/);
    expect(t).toMatch(/source=plugin/);
    rmSync(proj, { recursive: true, force: true });
  });
});
