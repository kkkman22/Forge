import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..");
const SKILL_PATH = resolve(ROOT, "skills/tinkerman/SKILL.md");

describe("R5.1: dispatcher SKILL.md frontmatter", () => {
  it("skills/tinkerman/SKILL.md exists", () => {
    expect(existsSync(SKILL_PATH)).toBe(true);
  });

  it("frontmatter has name: forge", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    expect(fm).toBeTruthy();
    expect(fm![1]).toMatch(/name:\s*tinkerman\b/);
  });

  it("frontmatter has non-empty description", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    expect(fm).toBeTruthy();
    expect(fm![1]).toMatch(/description:\s*.+/);
  });

  it("frontmatter does NOT have disable-model-invocation", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    expect(content).not.toMatch(/disable-model-invocation/);
  });

  it("frontmatter allowed-tools is exact set", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    expect(fm).toBeTruthy();

    const toolsMatch = fm![1].match(/allowed-tools:\s*(.+)/);
    expect(toolsMatch).toBeTruthy();
    const tools = toolsMatch![1].split(/,\s*/).map((t) => t.trim());
    expect(new Set(tools)).toEqual(new Set(["Read", "Agent", "Glob", "Grep", "Bash", "Skill"]));
  });
});
