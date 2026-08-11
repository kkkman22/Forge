import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

function readAgent(name: string): string {
  const p = join(ROOT, ".claude", "agents", `${name}.md`);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf-8");
}

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const yaml = match[1];
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) {
      const key = kv[1];
      const rawVal = kv[2].trim();
      if (rawVal === "") {
        // Multi-line array: collect indented "- x" lines
        const items: string[] = [];
        while (i + 1 < lines.length && lines[i + 1].match(/^\s+-\s+/)) {
          i++;
          items.push(lines[i].replace(/^\s+-\s+/, "").trim());
        }
        result[key] = items;
      } else if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
        result[key] = rawVal
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""));
      } else {
        result[key] = rawVal.replace(/^["']|["']$/g, "");
      }
    }
  }
  return result;
}

const VIEWPOINT_AGENTS = [
  "forge-decide-arch",
  "forge-decide-sec",
  "forge-decide-cost",
  "forge-decide-ops",
  "forge-decide-product",
];

const VIEWPOINT_COLORS: Record<string, string> = {
  "forge-decide-arch": "#3b82f6",
  "forge-decide-sec": "#ef4444",
  "forge-decide-cost": "#f59e0b",
  "forge-decide-ops": "#10b981",
  "forge-decide-product": "#8b5cf6",
};

describe("forge-decide-teams: viewpoint agent files", () => {
  it.each(VIEWPOINT_AGENTS)("%s exists", (name) => {
    const content = readAgent(name);
    expect(content.length).toBeGreaterThan(0);
  });

  it.each(VIEWPOINT_AGENTS)("%s has required frontmatter fields", (name) => {
    const content = readAgent(name);
    const fm = parseFrontmatter(content);
    expect(fm.name).toBe(name);
    expect(fm.description).toBeDefined();
    expect(fm.model).toBe("sonnet");
    expect(fm.maxTurns).toBe("15");
    expect(fm.memory).toBe("project");
    expect(fm.color).toBe(VIEWPOINT_COLORS[name]);
  });

  it.each(VIEWPOINT_AGENTS)("%s disallows Write/Edit/Bash", (name) => {
    const content = readAgent(name);
    const fm = parseFrontmatter(content);
    const disallowed = fm.disallowedTools as string[] | undefined;
    expect(disallowed).toBeDefined();
    expect(disallowed!).toContain("Write");
    expect(disallowed!).toContain("Edit");
    expect(disallowed!).toContain("Bash");
  });

  it.each(VIEWPOINT_AGENTS)("%s has allowedTools with Read/Glob/Grep/SendMessage", (name) => {
    const content = readAgent(name);
    const fm = parseFrontmatter(content);
    const allowed = fm.allowedTools as string[] | undefined;
    expect(allowed).toBeDefined();
    expect(allowed!).toContain("Read");
    expect(allowed!).toContain("Glob");
    expect(allowed!).toContain("Grep");
    expect(allowed!).toContain("SendMessage");
  });
});

describe("forge-decide-teams: team lead agent", () => {
  it("forge-decide-lead exists", () => {
    const content = readAgent("forge-decide-lead");
    expect(content.length).toBeGreaterThan(0);
  });

  it("has restrictedSubagents listing exactly 5 viewpoints", () => {
    const content = readAgent("forge-decide-lead");
    const fm = parseFrontmatter(content);
    const restricted = fm.restrictedSubagents as string[] | undefined;
    expect(restricted).toBeDefined();
    expect(restricted!).toHaveLength(5);
    for (const vp of VIEWPOINT_AGENTS) {
      expect(restricted!).toContain(vp);
    }
  });

  it("has Write in allowedTools", () => {
    const content = readAgent("forge-decide-lead");
    const fm = parseFrontmatter(content);
    const allowed = fm.allowedTools as string[] | undefined;
    expect(allowed).toBeDefined();
    expect(allowed!).toContain("Write");
  });

  it("has initialPrompt", () => {
    const content = readAgent("forge-decide-lead");
    const fm = parseFrontmatter(content);
    expect(fm.initialPrompt).toBeDefined();
  });
});

describe("forge-decide-teams: SKILL file", () => {
  const skillPath = join(ROOT, "skills", "tinkerman", "lib", "decide-teams", "instructions.md");

  it("exists", () => {
    expect(existsSync(skillPath)).toBe(true);
  });

  it("contains Execution Contract section", () => {
    const content = readFileSync(skillPath, "utf-8");
    expect(content).toMatch(/Execution Contract/i);
  });

  it("references forge-decide-lead", () => {
    const content = readFileSync(skillPath, "utf-8");
    expect(content).toContain("forge-decide-lead");
  });

  it("contains env var check requirement", () => {
    const content = readFileSync(skillPath, "utf-8");
    expect(content).toMatch(/CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS/);
  });
});

describe.skipIf(
  !existsSync(join(ROOT, ".kiro", "specs", "forge-decide-agent-teams", "poc-topics.md")),
)("forge-decide-teams: PoC topics file", () => {
  const topicsPath = join(ROOT, ".kiro", "specs", "forge-decide-agent-teams", "poc-topics.md");

  it("exists", () => {
    expect(existsSync(topicsPath)).toBe(true);
  });

  it("has at least 3 topics (## headings)", () => {
    const content = readFileSync(topicsPath, "utf-8");
    const headings = content.match(/^## [A-Z]/gm);
    expect(headings).toHaveLength(3);
  });
});
