import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALLOW_LIST, validateTopic } from "../../src/forge-dispatcher/allowlist.js";

const FORGE_ROOT = join(import.meta.dirname, "../..");
const REGISTRY_PATH = join(FORGE_ROOT, "skills/tinkerman/registry.toml");
const PLUGIN_JSON_PATH = join(FORGE_ROOT, ".claude-plugin/plugin.json");
const MARKETPLACE_JSON_PATH = join(FORGE_ROOT, ".claude-plugin/marketplace.json");
const SKILL_MD_PATH = join(FORGE_ROOT, "skills/tinkerman/SKILL.md");

function parseRegistrySections(tomlContent: string): string[] {
  const sections: string[] = [];
  for (const line of tomlContent.split("\n")) {
    const match = /^\[([^\]]+)\]/.exec(line);
    if (match) sections.push(match[1]);
  }
  return sections;
}

const EXPECTED_COUNT = ALLOW_LIST.length;

describe("allowlist parity with registry.toml", () => {
  it("ALLOW_LIST length matches registry.toml section count", () => {
    const toml = readFileSync(REGISTRY_PATH, "utf-8");
    const sections = parseRegistrySections(toml);
    expect(ALLOW_LIST.length).toBe(sections.length);
  });

  it("dispatches 'init' successfully", () => {
    const result = validateTopic("init");
    expect(result).toEqual({ ok: true, value: "init" });
  });

  it("dispatches 'review-comment-bitbucket' successfully", () => {
    const result = validateTopic("review-comment-bitbucket");
    expect(result).toEqual({ ok: true, value: "review-comment-bitbucket" });
  });

  it("every registry section is in ALLOW_LIST", () => {
    const toml = readFileSync(REGISTRY_PATH, "utf-8");
    const sections = parseRegistrySections(toml);
    for (const section of sections) {
      expect(ALLOW_LIST).toContain(section);
    }
  });
});

describe("subcommand count parity across all declarations (P2-3)", () => {
  it("plugin.json subcommand count matches allowlist", () => {
    const content = readFileSync(PLUGIN_JSON_PATH, "utf-8");
    const match = content.match(/with\s+(\d+)\s+internal\s+subcommands/);
    expect(match, "plugin.json should contain 'N internal subcommands'").not.toBeNull();
    expect(Number(match![1])).toBe(EXPECTED_COUNT);
  });

  it("marketplace.json subcommand count matches allowlist", () => {
    const content = readFileSync(MARKETPLACE_JSON_PATH, "utf-8");
    const match = content.match(/with\s+(\d+)\s+internal\s+subcommands/);
    expect(match, "marketplace.json should contain 'N internal subcommands'").not.toBeNull();
    expect(Number(match![1])).toBe(EXPECTED_COUNT);
  });

  it("SKILL.md description declares correct sub-skill count", () => {
    const content = readFileSync(SKILL_MD_PATH, "utf-8");
    const match = content.match(/routes\s+to\s+(\d+)\s+sub-skills/);
    expect(match, "SKILL.md should contain 'routes to N sub-skills'").not.toBeNull();
    expect(Number(match![1])).toBe(EXPECTED_COUNT);
  });

  it("SKILL.md body declares correct total sub-skill count", () => {
    const content = readFileSync(SKILL_MD_PATH, "utf-8");
    const match = content.match(/All\s+(\d+)\s+sub-skills\s+live/);
    expect(match, "SKILL.md should contain 'All N sub-skills live'").not.toBeNull();
    expect(Number(match![1])).toBe(EXPECTED_COUNT);
  });

  it("SKILL.md allowlist count matches", () => {
    const content = readFileSync(SKILL_MD_PATH, "utf-8");
    const match = content.match(/(\d+)-sub\s+allowlist/);
    expect(match, "SKILL.md should contain 'N-sub allowlist'").not.toBeNull();
    expect(Number(match![1])).toBe(EXPECTED_COUNT);
  });

  it("fork + inline counts sum to total", () => {
    const content = readFileSync(SKILL_MD_PATH, "utf-8");
    const forkMatch = content.match(/\*?\*fork\*?\*\s+\((\d+)\s+subs\)/);
    const inlineMatch = content.match(/\*?\*inline\*?\*\s+\((\d+)\s+subs\)/);
    expect(forkMatch, "SKILL.md should have fork count").not.toBeNull();
    expect(inlineMatch, "SKILL.md should have inline count").not.toBeNull();
    const forkCount = Number(forkMatch![1]);
    const inlineCount = Number(inlineMatch![1]);
    expect(forkCount + inlineCount).toBe(EXPECTED_COUNT);
  });
});
