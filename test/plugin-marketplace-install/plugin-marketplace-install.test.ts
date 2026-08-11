/**
 * AC 13.3 — marketplace install simulation.
 *
 * Simulates the Claude Code marketplace install flow:
 *   1. Read `.claude-plugin/marketplace.json`
 *   2. Resolve the `forge` plugin entry's `source` (`./`)
 *   3. Copy plugin assets (workflows/, .claude-plugin/) to a temp install dir
 *   4. Re-read installed plugin.json, follow each `workflows[]` entry
 *   5. Assert `multi-agent-review.js` is discovered, parseable, and referenced
 *
 * This does NOT shell out to `claude plugin install` (that requires network +
 * the Claude CLI). Instead we replicate the deterministic file-resolution
 * contract Claude Code performs at install time.
 */

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");

interface PluginManifest {
  name: string;
  workflows?: string[];
  mcpServers?: Record<string, unknown>;
  hooks?: Record<string, unknown>;
}

interface MarketplaceManifest {
  plugins: Array<{ name: string; source: string }>;
}

describe("Plugin Marketplace Install (AC 13.3)", () => {
  let installDir: string;
  let installedPluginPath: string;

  beforeAll(() => {
    const marketplacePath = join(ROOT, ".claude-plugin", "marketplace.json");
    const marketplace = JSON.parse(readFileSync(marketplacePath, "utf-8")) as MarketplaceManifest;

    const tinkermanPlugin = marketplace.plugins.find((p) => p.name === "tinkerman");
    if (!tinkermanPlugin) throw new Error("marketplace.json missing 'tinkerman' plugin entry");

    const sourcePath = resolve(ROOT, tinkermanPlugin.source);

    installDir = mkdtempSync(join(tmpdir(), "forge-install-"));

    // Replicate marketplace install: copy `.claude-plugin/`, `workflows/`, `agents/`,
    // `commands/`, `hooks/` from source to install dir. Skip heavy dirs (node_modules,
    // dist, .git, .claude/worktrees) to keep test fast.
    const includeDirs = [".claude-plugin", "workflows", "agents", "commands", "hooks"];
    for (const d of includeDirs) {
      const src = join(sourcePath, d);
      if (existsSync(src)) cpSync(src, join(installDir, d), { recursive: true });
    }

    // Node 18 runs --check in CJS mode by default; ESM workflow .js files fail without this.
    writeFileSync(join(installDir, "package.json"), '{"type":"module"}');

    installedPluginPath = join(installDir, ".claude-plugin", "plugin.json");
  });

  afterAll(() => {
    // Best-effort cleanup; tmpdir auto-purges on most CI systems
    try {
      rmSync(installDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("installed plugin.json exists and is parseable", () => {
    expect(existsSync(installedPluginPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(installedPluginPath, "utf-8")) as PluginManifest;
    expect(manifest.name).toBe("tinkerman");
  });

  it("installed plugin.json declares workflows field with at least one entry", () => {
    const manifest = JSON.parse(readFileSync(installedPluginPath, "utf-8")) as PluginManifest;
    expect(Array.isArray(manifest.workflows)).toBe(true);
    expect((manifest.workflows ?? []).length).toBeGreaterThan(0);
  });

  it("each workflows[] path resolves to a directory under the install root", () => {
    const manifest = JSON.parse(readFileSync(installedPluginPath, "utf-8")) as PluginManifest;
    for (const entry of manifest.workflows ?? []) {
      const abs = resolve(installDir, entry);
      expect(existsSync(abs), `workflows entry '${entry}' missing in install dir`).toBe(true);
      expect(statSync(abs).isDirectory(), `workflows entry '${entry}' is not a directory`).toBe(
        true,
      );
    }
  });

  it("multi-agent-review.js is discovered after marketplace install", () => {
    const manifest = JSON.parse(readFileSync(installedPluginPath, "utf-8")) as PluginManifest;
    let found = false;
    for (const entry of manifest.workflows ?? []) {
      const abs = resolve(installDir, entry);
      if (!existsSync(abs) || !statSync(abs).isDirectory()) continue;
      const files = readdirSync(abs).filter((f) => f.endsWith(".js"));
      if (files.includes("multi-agent-review.js")) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("discovered multi-agent-review.js parses cleanly via node --check", () => {
    const manifest = JSON.parse(readFileSync(installedPluginPath, "utf-8")) as PluginManifest;
    let scriptPath: string | null = null;
    for (const entry of manifest.workflows ?? []) {
      const candidate = resolve(installDir, entry, "multi-agent-review.js");
      if (existsSync(candidate)) {
        scriptPath = candidate;
        break;
      }
    }
    expect(scriptPath).not.toBeNull();
    if (!scriptPath) return;
    expect(() => execFileSync("node", ["--check", scriptPath], { stdio: "pipe" })).not.toThrow();
  });
});
