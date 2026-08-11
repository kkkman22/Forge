import { resolve } from "node:path";
import { glob } from "glob";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..");

describe("R1.1: only one forge skill registered", () => {
  it("skills/*/SKILL.md glob returns exactly skills/tinkerman/SKILL.md", async () => {
    const matches = await glob("skills/*/SKILL.md", { cwd: ROOT });
    expect(matches).toEqual(["skills/tinkerman/SKILL.md"]);
  });
});
