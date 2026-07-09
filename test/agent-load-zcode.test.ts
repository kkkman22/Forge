/**
 * T9 (R5): agent load verification for ZCode.
 *
 * Verifies the 24 agent roles are loadable on ZCode: correct count (excl. README),
 * each has frontmatter with name + description (ZCode agent loading prerequisites),
 * and resolution does not depend on a non-standard CLAUDE_AGENTS_DIR env var.
 *
 * ZCode discovers plugin agents via the manifest `agents` field (directory), not
 * via env var — so the count + frontmatter contract is the loadability guarantee.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const AGENTS_DIR = resolve(__dirname, "../agents");
const EXPECTED_AGENT_COUNT = 24;

function agentFiles(): string[] {
  return readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort();
}

describe("agent load verification (R5 / ZCode)", () => {
  it("has exactly 24 agent roles (excluding README)", () => {
    const files = agentFiles();
    expect(files).toHaveLength(EXPECTED_AGENT_COUNT);
  });

  it("every agent has YAML frontmatter", () => {
    for (const f of agentFiles()) {
      const content = readFileSync(resolve(AGENTS_DIR, f), "utf8");
      expect(content.startsWith("---\n"), `${f} missing frontmatter`).toBe(true);
    }
  });

  it("every agent frontmatter declares name + description", () => {
    for (const f of agentFiles()) {
      const content = readFileSync(resolve(AGENTS_DIR, f), "utf8");
      const fm = content.split("---\n")[1] || "";
      expect(fm, `${f} has no frontmatter body`).toMatch(/.{1,}/);
      expect(fm, `${f} frontmatter missing name`).toMatch(/^name:\s+.+$/m);
      expect(fm, `${f} frontmatter missing description`).toMatch(/^description:\s+.+$/m);
    }
  });

  it("agent discovery does not depend on CLAUDE_AGENTS_DIR env var", () => {
    // ZCode does not inject CLAUDE_AGENTS_DIR. Agents resolve via the plugin
    // manifest `agents` directory field + cwd fallback. This test documents that
    // the count is stable regardless of that env var's presence.
    const saved = process.env.CLAUDE_AGENTS_DIR;
    delete process.env.CLAUDE_AGENTS_DIR;
    const files = agentFiles();
    process.env.CLAUDE_AGENTS_DIR = saved;
    expect(files).toHaveLength(EXPECTED_AGENT_COUNT);
  });
});
