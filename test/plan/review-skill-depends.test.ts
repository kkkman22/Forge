import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SKILL_PATH = resolve(__dirname, "../../skills/tinkerman/lib/review/instructions.md");

describe("Review SKILL.md — Layer 2 dependency order check", () => {
  it("Layer 2 mentions commit order vs dependency graph", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    expect(content.toLowerCase()).toMatch(
      /commit.*(order|sequence).*(depend|topo)|(depend|topo).*(commit.*(order|sequence))/,
    );
  });
});
