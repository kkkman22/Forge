import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SKILL_PATH = resolve(__dirname, "../../skills/tinkerman/lib/plan/instructions.md");
const DEP_RULES_PATH = resolve(
  __dirname,
  "../../skills/tinkerman/lib/plan/references/dependency-rules.md",
);

describe("Plan SKILL.md — Step 3.5 dependency identification", () => {
  const skill = readFileSync(SKILL_PATH, "utf-8");

  it("contains Step 3.5 dependency identification sub-step", () => {
    expect(skill).toContain("3.5");
    expect(skill.toLowerCase()).toContain("depend");
  });

  it("Step 4 includes Dependency Graph Validity check", () => {
    expect(skill).toMatch(/dependency.*graph|graph.*valid/i);
  });

  it("references dependency-rules.md", () => {
    expect(skill).toContain("dependency-rules");
  });

  it("dependency-rules.md file exists and has content", () => {
    const content = readFileSync(DEP_RULES_PATH, "utf-8");
    expect(content.length).toBeGreaterThan(50);
    expect(content.toLowerCase()).toContain("depend");
  });
});
