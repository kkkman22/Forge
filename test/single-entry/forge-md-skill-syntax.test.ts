import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FORGE_MD = resolve(import.meta.dirname, "../../commands/forge.md");
const content = readFileSync(FORGE_MD, "utf-8");

describe("commands/forge.md Skill syntax (R2)", () => {
  it("should contain zero non-example occurrences of Skill(skill=\"forge\", args=...) pseudo-call", () => {
    const lines = content.split("\n");
    const nonExampleLines = lines.filter((l) => !l.includes("❌"));
    const matches = nonExampleLines.join("\n").match(/Skill\(skill="forge"/g);
    expect(matches).toBeNull();
  });

  it("should reference Skill(forge-router) at least once", () => {
    expect(content).toMatch(/Skill\(forge-router\)/);
  });

  const coreSkills = [
    "forge-plan",
    "forge-build",
    "forge-review",
    "forge-test",
    "forge-ship",
    "forge-learn",
  ] as const;

  for (const skill of coreSkills) {
    it(`should reference Skill(${skill}) at least once`, () => {
      const re = new RegExp(`Skill\\(${skill}\\)`);
      expect(content).toMatch(re);
    });
  }

  it("should not claim 'forge is the only registered skill'", () => {
    expect(content).not.toMatch(/forge`?\s*是唯一注册的统一入口\s*skill/);
  });

  it("should mention disable-model-invocation at least once", () => {
    expect(content).toMatch(/disable-model-invocation/);
  });
});
