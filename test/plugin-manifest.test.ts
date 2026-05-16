import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");

describe("Plugin Manifest", () => {
  const pluginPath = join(ROOT, ".claude-plugin", "plugin.json");
  const marketplacePath = join(ROOT, ".claude-plugin", "marketplace.json");
  const packagePath = join(ROOT, "package.json");

  it("plugin.json exists and is valid JSON", () => {
    expect(existsSync(pluginPath)).toBe(true);
    const content = readFileSync(pluginPath, "utf-8");
    const manifest = JSON.parse(content);
    expect(manifest.name).toBe("forge");
    expect(manifest.description).toBeTruthy();
    expect(manifest.version).toBeTruthy();
    expect(manifest.license).toBe("MIT");
  });

  it("plugin.json version matches package.json", () => {
    const plugin = JSON.parse(readFileSync(pluginPath, "utf-8"));
    const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
    expect(plugin.version).toBe(pkg.version);
  });

  it("plugin.json hooks use CLAUDE_PLUGIN_ROOT", () => {
    const plugin = JSON.parse(readFileSync(pluginPath, "utf-8"));
    const hooks = plugin.hooks;
    expect(hooks).toBeDefined();

    const hookJson = JSON.stringify(hooks);
    const pluginRootRefs = (hookJson.match(/\$\{CLAUDE_PLUGIN_ROOT\}/g) || []).length;
    expect(pluginRootRefs).toBeGreaterThan(0);
  });

  it("plugin.json has no hardcoded ~/.claude/skills/forge paths", () => {
    const content = readFileSync(pluginPath, "utf-8");
    expect(content).not.toContain("~/.claude/skills/forge");
  });

  it("marketplace.json exists and is valid JSON", () => {
    expect(existsSync(marketplacePath)).toBe(true);
    const manifest = JSON.parse(readFileSync(marketplacePath, "utf-8"));
    expect(manifest.name).toBeTruthy();
    expect(manifest.plugins).toBeInstanceOf(Array);
    expect(manifest.plugins.length).toBeGreaterThan(0);
    expect(manifest.plugins[0].name).toBe("forge");
  });

  it("marketplace.json has required schema fields", () => {
    const manifest = JSON.parse(readFileSync(marketplacePath, "utf-8"));
    expect(manifest.$schema).toContain("marketplace.schema.json");
    expect(manifest.description).toBeTruthy();
    expect(manifest.owner).toBeDefined();
  });
});

describe("Commands Directory", () => {
  const commandsDir = join(ROOT, "commands");

  it("has exactly 1 user-facing command file (single-entry model)", () => {
    const files = readdirSync(commandsDir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBe(1);
    expect(files[0]).toBe("forge.md");
  });

  it("every command .md has description frontmatter", () => {
    const files = readdirSync(commandsDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const content = readFileSync(join(commandsDir, file), "utf-8");
      expect(content).toMatch(/^---\n[\s\S]*?description:/);
    }
  });

  it("forge.md command exists", () => {
    expect(existsSync(join(commandsDir, "forge.md"))).toBe(true);
  });
});

describe("Plugin Asset Integrity", () => {
  it("skills directory has >= 25 skill directories", () => {
    const skillsDir = join(ROOT, "skills");
    const dirs = readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(dirs.length).toBeGreaterThanOrEqual(25);
  });

  it("agents directory has >= 10 agent files", () => {
    const agentsDir = join(ROOT, "agents");
    const files = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it("all referenced skill directories have SKILL.md", () => {
    const skillsDir = join(ROOT, "skills");
    const dirs = readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((n) => n !== "shared");

    for (const dir of dirs) {
      expect(existsSync(join(skillsDir, dir, "SKILL.md")), `Missing skills/${dir}/SKILL.md`).toBe(
        true,
      );
    }
  });
});
