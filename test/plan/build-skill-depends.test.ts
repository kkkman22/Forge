import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SKILL_PATH = resolve(__dirname, "../../skills/tinkerman/lib/build/instructions.md");

describe("Build SKILL.md — dependsOn awareness", () => {
  it("§3.2 references dependsOn or topological order", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    expect(content.toLowerCase()).toMatch(/depends\s*on|topological|dep\s*graph/);
  });
});
