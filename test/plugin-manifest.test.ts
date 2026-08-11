import { execFileSync } from "node:child_process";
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
    expect(manifest.name).toBe("tinkerman");
    expect(manifest.description).toBeTruthy();
    expect(manifest.version).toBeTruthy();
    expect(manifest.license).toBe("MIT");
  });

  it("plugin.json version matches package.json", () => {
    const plugin = JSON.parse(readFileSync(pluginPath, "utf-8"));
    const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
    expect(plugin.version).toBe(pkg.version);
  });

  it("hooks/hooks.json exists and has valid hook entries", () => {
    const hooksPath = join(ROOT, "hooks", "hooks.json");
    expect(existsSync(hooksPath)).toBe(true);
    const hooks = JSON.parse(readFileSync(hooksPath, "utf-8"));
    expect(hooks.hooks).toBeDefined();
    expect(Object.keys(hooks.hooks).length).toBeGreaterThan(0);
  });

  it("plugin.json has no hardcoded ~/.claude/skills/tinkerman paths", () => {
    const content = readFileSync(pluginPath, "utf-8");
    expect(content).not.toContain("~/.claude/skills/tinkerman");
  });

  it("marketplace.json exists and is valid JSON", () => {
    expect(existsSync(marketplacePath)).toBe(true);
    const manifest = JSON.parse(readFileSync(marketplacePath, "utf-8"));
    expect(manifest.name).toBeTruthy();
    expect(manifest.plugins).toBeInstanceOf(Array);
    expect(manifest.plugins.length).toBeGreaterThan(0);
    expect(manifest.plugins[0].name).toBe("tinkerman");
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
    expect(files[0]).toBe("tinkerman.md");
  });

  it("every command .md has description frontmatter", () => {
    const files = readdirSync(commandsDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const content = readFileSync(join(commandsDir, file), "utf-8");
      expect(content).toMatch(/^---\n[\s\S]*?description:/);
    }
  });

  it("tinkerman.md command exists", () => {
    expect(existsSync(join(commandsDir, "tinkerman.md"))).toBe(true);
  });
});

describe("Plugin Workflows Field (R1: workflows-integration)", () => {
  const pluginPath = join(ROOT, ".claude-plugin", "plugin.json");
  const workflowsDir = join(ROOT, "workflows");
  const multiAgentReview = join(workflowsDir, "multi-agent-review.js");

  it("AC 1.1: plugin.json declares workflows field with ./workflows", () => {
    const manifest = JSON.parse(readFileSync(pluginPath, "utf-8"));
    expect(manifest.workflows).toBeDefined();
    expect(Array.isArray(manifest.workflows)).toBe(true);
    expect(manifest.workflows).toContain("./workflows");
  });

  it("AC 1.2: workflows/multi-agent-review.js exists at plugin root", () => {
    expect(existsSync(workflowsDir)).toBe(true);
    expect(existsSync(multiAgentReview)).toBe(true);
  });

  it("AC 1.2: multi-agent-review.js passes node --check (syntactic validity)", () => {
    const source = readFileSync(multiAgentReview, "utf-8");
    expect(source.length).toBeGreaterThan(0);
    expect(() =>
      execFileSync("node", ["--check", multiAgentReview], { stdio: "pipe" }),
    ).not.toThrow();
  });

  it("AC 1.4: existing workflows field does not break mcpServers/hooks paths", () => {
    // mcpServers moved to .mcp.json, hooks moved to hooks/hooks.json (refactor: zero global side effects)
    const mcpPath = join(ROOT, ".mcp.json");
    expect(existsSync(mcpPath)).toBe(true);
    const mcp = JSON.parse(readFileSync(mcpPath, "utf-8"));
    expect(mcp.mcpServers).toBeDefined();
    expect(mcp.mcpServers["tinkerman-context"]).toBeDefined();

    const hooksPath = join(ROOT, "hooks", "hooks.json");
    expect(existsSync(hooksPath)).toBe(true);
    const hooks = JSON.parse(readFileSync(hooksPath, "utf-8"));
    expect(hooks.hooks).toBeDefined();
    expect(hooks.hooks.SessionStart).toBeDefined();
    expect(hooks.hooks.UserPromptSubmit).toBeDefined();
    expect(hooks.hooks.PreToolUse).toBeDefined();
    expect(hooks.hooks.PostToolUse).toBeDefined();
    expect(hooks.hooks.Stop).toBeDefined();
  });

  it("AC 13.1: every workflows[] path is relative (does not start with / or ~)", () => {
    const manifest = JSON.parse(readFileSync(pluginPath, "utf-8"));
    for (const entry of manifest.workflows) {
      expect(typeof entry).toBe("string");
      expect(entry.startsWith("/")).toBe(false);
      expect(entry.startsWith("~")).toBe(false);
    }
  });

  it("AC 13.1: every workflows[] directory contains at least one .js file", () => {
    const manifest = JSON.parse(readFileSync(pluginPath, "utf-8"));
    for (const entry of manifest.workflows) {
      const absDir = join(ROOT, entry);
      expect(existsSync(absDir)).toBe(true);
      const jsFiles = readdirSync(absDir).filter((f) => f.endsWith(".js"));
      expect(jsFiles.length).toBeGreaterThan(0);
    }
  });

  it("AC 13.1: at least one .js in workflows/ parses via esbuild --analyze", () => {
    const jsFiles = readdirSync(workflowsDir).filter((f) => f.endsWith(".js"));
    expect(jsFiles.length).toBeGreaterThan(0);
    let parsedAtLeastOne = false;
    for (const f of jsFiles) {
      const result = execFileSync(
        "npx",
        ["--no-install", "esbuild", join(workflowsDir, f), "--bundle=false", "--log-level=silent"],
        { stdio: "pipe" },
      );
      expect(result.length).toBeGreaterThan(0);
      parsedAtLeastOne = true;
    }
    expect(parsedAtLeastOne).toBe(true);
  });
});

describe("Plugin Asset Integrity", () => {
  it("skills/tinkerman/lib has >= 25 sub-skill directories", () => {
    const libDir = join(ROOT, "skills", "tinkerman", "lib");
    const dirs = readdirSync(libDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(dirs.length).toBeGreaterThanOrEqual(25);
  });

  it("agents directory has >= 10 agent files", () => {
    const agentsDir = join(ROOT, "agents");
    const files = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it("all sub-skill directories have instructions.md", () => {
    const libDir = join(ROOT, "skills", "tinkerman", "lib");
    const dirs = readdirSync(libDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const dir of dirs) {
      expect(
        existsSync(join(libDir, dir, "instructions.md")),
        `Missing skills/tinkerman/lib/${dir}/instructions.md`,
      ).toBe(true);
    }
  });
});

describe("Workflows Field", () => {
  const pluginPath = join(ROOT, ".claude-plugin", "plugin.json");

  it("plugin.json declares workflows field with relative path", () => {
    const plugin = JSON.parse(readFileSync(pluginPath, "utf-8"));
    expect(plugin.workflows).toBeDefined();
    expect(plugin.workflows).toBeInstanceOf(Array);
    expect(plugin.workflows).toContain("./workflows");
  });

  it("workflows directory exists at plugin root", () => {
    const plugin = JSON.parse(readFileSync(pluginPath, "utf-8"));
    const workflowsDir = join(ROOT, plugin.workflows[0]);
    expect(existsSync(workflowsDir)).toBe(true);
    expect(readdirSync(workflowsDir).filter((f) => f.endsWith(".js")).length).toBeGreaterThan(0);
  });

  it("multi-agent-review.js exists in workflows directory", () => {
    const plugin = JSON.parse(readFileSync(pluginPath, "utf-8"));
    const reviewWorkflow = join(ROOT, plugin.workflows[0], "multi-agent-review.js");
    expect(existsSync(reviewWorkflow)).toBe(true);
  });

  it("workflows JS files pass node --check syntax validation", () => {
    const plugin = JSON.parse(readFileSync(pluginPath, "utf-8"));
    const workflowsDir = join(ROOT, plugin.workflows[0]);
    const jsFiles = readdirSync(workflowsDir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => join(workflowsDir, f));

    for (const file of jsFiles) {
      const { execSync } = require("node:child_process");
      expect(() => execSync(`node --check "${file}"`, { stdio: "pipe" })).not.toThrow();
    }
  });
});
