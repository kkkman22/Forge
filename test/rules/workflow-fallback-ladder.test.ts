import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const RULE_PATH = join(ROOT, ".claude", "rules", "workflow-fallback-ladder.md");

function readRule(): string {
  return readFileSync(RULE_PATH, "utf-8");
}

describe("R3.1: workflow-fallback-ladder.md exists with L0-L3 markers", () => {
  it("file exists at .claude/rules/workflow-fallback-ladder.md", () => {
    expect(existsSync(RULE_PATH)).toBe(true);
  });

  it("file is non-empty", () => {
    expect(readRule().length).toBeGreaterThan(0);
  });

  it("contains L0, L1, L2, L3 level identifiers", () => {
    const content = readRule();
    expect(content).toContain("L0");
    expect(content).toContain("L1");
    expect(content).toContain("L2");
    expect(content).toContain("L3");
  });
});

describe("R3.2: cross-reference ADR + hard-gate keyword", () => {
  it("contains ADR cross-reference 2026-05-18-review-fallback-ladder.md", () => {
    expect(readRule()).toContain("2026-05-18-review-fallback-ladder.md");
  });

  it("contains hard-gate keyword (case-insensitive HARD-GATE / hard-gate)", () => {
    const content = readRule();
    expect(/hard-gate/i.test(content)).toBe(true);
  });

  it("declares L3 prohibits main-agent substitute", () => {
    const content = readRule();
    expect(content).toMatch(/L3.*主 agent.*顶替|主 agent 顶替.*L3|l3-no-main-agent-substitute/i);
  });
});

describe("R3.3: frontmatter inclusion: always", () => {
  it("frontmatter declares inclusion: always", () => {
    const content = readRule();
    expect(content).toMatch(/^---\n[\s\S]*?inclusion:\s*always[\s\S]*?\n---/);
  });
});

describe("R3.5: methodology table aligns with R2.4–R2.6", () => {
  const expectedMethodologyValues = [
    "workflow",
    "subagent-parallel",
    "workflow-then-subagent",
    "subagent-serial",
    "unavailable",
  ];

  for (const value of expectedMethodologyValues) {
    it(`mentions methodology field value: ${value}`, () => {
      expect(readRule()).toContain(value);
    });
  }

  it("declares L3 blocks ship", () => {
    const content = readRule();
    expect(content).toMatch(/L3[\s\S]*阻断 ship|L3.*ship.*阻断|L3[\s\S]*\*\*是\*\*/);
  });

  it("renders a 4-level table (L0/L1/L2/L3 each appear in a table row)", () => {
    const content = readRule();
    const lines = content.split("\n");
    const tableRows = lines.filter((l) => /^\|\s*\*{0,2}L[0-3]\*{0,2}\s*\|/.test(l));
    expect(tableRows.length).toBeGreaterThanOrEqual(4);
  });
});

describe("R3.4: forge-review/decide/learn skills load this rule (auto-include)", () => {
  it("frontmatter inclusion: always implies system prompt injection", () => {
    const content = readRule();
    expect(content).toMatch(/inclusion:\s*always/);
  });
});

describe("R11.6: forge-build SKILL does NOT reference this rule", () => {
  it("forge-build instructions.md does not @-reference workflow-fallback-ladder.md", () => {
    const buildSkill = join(ROOT, "skills", "forge", "lib", "build", "instructions.md");
    if (!existsSync(buildSkill)) {
      // Skill may not exist yet — pass implicitly (R11.6 is for forge-build only)
      return;
    }
    const content = readFileSync(buildSkill, "utf-8");
    expect(content).not.toContain("workflow-fallback-ladder.md");
  });
});
