/**
 * P2 R5 (T9/T10): Zcode plugin manifest + top-level marketplace.
 *
 * Validates .zcode-plugin/plugin.json and marketplace.json are legal JSON,
 * share the same commands/skills/agents/hooks/mcp sources as the Claude
 * manifest, declare the three userConfig points, and that the Claude manifest
 * is left unchanged (dual manifest isolation).
 *
 * Validates: requirements R5-AC1..AC6.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(ROOT, rel), "utf-8")) as Record<string, unknown>;
}

describe(".zcode-plugin/plugin.json", () => {
  const m = readJson(".zcode-plugin/plugin.json");

  it("is legal JSON with name/version", () => {
    expect(m.name).toBe("forge");
    expect(m.version).toBe("3.9.0");
  });

  it("description mentions Zcode + GLM-5.2 (dual-platform)", () => {
    const desc = String(m.description);
    expect(desc).toMatch(/Zcode/i);
    expect(desc).toMatch(/GLM-5\.2/);
  });

  it("shares source dirs with Claude manifest (commands/skills/agents/hooks/mcp)", () => {
    expect(m.commands).toBe("./commands");
    expect(m.skills).toBe("./skills");
    expect(m.agents).toBe("./agents");
    expect(m.hooks).toBe("./hooks/hooks.json");
    expect(m.mcpServers).toBe("./.mcp.json");
  });

  it("declares the three userConfig points", () => {
    const uc = m.userConfig as Record<string, Record<string, unknown>>;
    expect(uc.max_parallel_agents).toBeDefined();
    expect(uc.safety_level).toBeDefined();
    expect(uc.context_budget_override).toBeDefined();
    // 0 = auto-derive (capability-driven)
    expect(uc.context_budget_override.default).toBe(0);
  });

  it("keywords include zcode + glm-5.2", () => {
    const kw = m.keywords as string[];
    expect(kw).toContain("zcode");
    expect(kw.some((k) => /glm-5\.2/i.test(k))).toBe(true);
  });
});

describe("marketplace.json (top-level Zcode)", () => {
  const mk = readJson("marketplace.json");

  it("is legal JSON with name/pluginRoot/plugins", () => {
    expect(mk.name).toBe("forge-official");
    expect(mk.pluginRoot).toBe(".");
    expect(Array.isArray(mk.plugins)).toBe(true);
  });

  it("contains a forge plugin entry pointing at the repo", () => {
    const plugins = mk.plugins as Array<Record<string, unknown>>;
    const forge = plugins.find((p) => p.name === "forge");
    expect(forge).toBeDefined();
    const src = forge?.source as Record<string, string>;
    expect(src.source).toBe("github");
    expect(src.repo).toBe("kkkman22/Forge");
  });
});

describe("Claude manifest isolation (R5-AC6)", () => {
  it(".claude-plugin/plugin.json still present and unchanged shape", () => {
    const c = readJson(".claude-plugin/plugin.json");
    expect(c.name).toBe("forge");
    // Claude-specific field still present (not removed by P2).
    expect(c.requiredMinimumVersion).toBe("2.1.163");
  });
});
