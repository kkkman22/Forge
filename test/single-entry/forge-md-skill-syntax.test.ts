import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FORGE_MD = resolve(import.meta.dirname, "../../commands/tinkerman.md");
const content = readFileSync(FORGE_MD, "utf-8");

describe("commands/tinkerman.md Skill syntax (R2)", () => {
  it("should contain Skill(tinkerman) call", () => {
    expect(content).toMatch(/Skill\(tinkerman\)/);
  });

  it("should NOT contain any Skill(forge-X) sub-skill calls", () => {
    expect(content).not.toMatch(/Skill\(forge-[a-z]/);
  });

  it("should NOT contain disable-model-invocation (moved to lib)", () => {
    expect(content).not.toMatch(/disable-model-invocation/);
  });

  it("should reference skills/tinkerman/SKILL.md", () => {
    expect(content).toContain("skills/tinkerman/SKILL.md");
  });

  it("should be a thin stub ≤ 25 lines", () => {
    const lineCount = content.split("\n").length;
    expect(lineCount).toBeLessThanOrEqual(25);
  });
});
