import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ALLOW_LIST } from "../../src/forge-dispatcher/allowlist.js";

const ROOT = resolve(import.meta.dirname, "../..");
const REGISTRY = resolve(ROOT, "skills/tinkerman/registry.toml");
const COMMANDS_SSOT = resolve(ROOT, "docs/_ssot/commands.json");
const PLUGIN_JSON = resolve(ROOT, ".claude-plugin/plugin.json");
const MARKETPLACE_JSON = resolve(ROOT, ".claude-plugin/marketplace.json");
const SKILL_MD = resolve(ROOT, "skills/tinkerman/SKILL.md");
const SYNC_SCRIPT = resolve(ROOT, "scripts/sync-command-registry.mjs");

function registrySections(): string[] {
  const content = readFileSync(REGISTRY, "utf-8");
  return [...content.matchAll(/^\[([^\]]+)\]/gm)].map((m) => m[1]);
}

function declaredTotalCounts(file: string, content: string): number[] {
  if (file.endsWith("plugin.json") || file.endsWith("marketplace.json")) {
    return [...content.matchAll(/\b(\d+)\s+internal\s+subcommands\b/g)].map((m) => Number(m[1]));
  }
  return [
    ...content.matchAll(/routes\s+to\s+(\d+)\s+sub-skills/g),
    ...content.matchAll(/All\s+(\d+)\s+sub-skills\s+live/g),
    ...content.matchAll(/\b(\d+)-sub\s+allowlist/g),
  ].map((m) => Number(m[1]));
}

describe("long-term evolution: command registry generation chain", () => {
  it("has a single sync script for registry -> allowlist -> docs -> plugin metadata", () => {
    expect(existsSync(SYNC_SCRIPT)).toBe(true);
    const script = readFileSync(SYNC_SCRIPT, "utf-8");
    expect(script).toContain("skills/tinkerman/registry.toml");
    expect(script).toContain("src/forge-dispatcher/allowlist.ts");
    expect(script).toContain("docs/_ssot/commands.json");
    expect(script).toContain(".claude-plugin/plugin.json");
    expect(script).toContain(".claude-plugin/marketplace.json");
    expect(script).toContain("--check");
  });

  it("allowlist, docs SSOT, and plugin metadata are derived from the registry count", () => {
    const sections = registrySections();
    const commands = JSON.parse(readFileSync(COMMANDS_SSOT, "utf-8")) as Array<{ name: string }>;
    const commandNames = commands.map((c) => c.name.replace(/^\/tinkerman\s*/, ""));
    const expectedCount = sections.length;

    expect(ALLOW_LIST).toEqual(sections);
    expect(commandNames.sort()).toEqual([...sections].sort());
    expect(commands).toHaveLength(expectedCount);

    for (const file of [PLUGIN_JSON, MARKETPLACE_JSON, SKILL_MD]) {
      const counts = declaredTotalCounts(file, readFileSync(file, "utf-8"));
      expect(counts.length, `missing declared counts in ${file}`).toBeGreaterThan(0);
      for (const count of counts) expect(count).toBe(expectedCount);
    }
  });
});
