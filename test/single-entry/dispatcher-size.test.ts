import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..");
const SKILL_PATH = resolve(ROOT, "skills/tinkerman/SKILL.md");

describe("R5.3: dispatcher SKILL.md size ≤ 250 lines", () => {
  it("skills/tinkerman/SKILL.md exists", () => {
    expect(existsSync(SKILL_PATH)).toBe(true);
  });

  it("line count ≤ 250", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");
    const lineCount = content.split("\n").length;
    expect(lineCount).toBeLessThanOrEqual(250);
  });
});
