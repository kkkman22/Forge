import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FORGE_MD = resolve(import.meta.dirname, "../../commands/tinkerman.md");
const content = readFileSync(FORGE_MD, "utf-8");

describe("commands/tinkerman.md is thin stub (R1)", () => {
  it("should NOT contain old subcommand dispatch table", () => {
    const tableRows = content.match(/^\| `\w[\w-]*` \|/gm);
    expect(tableRows).toBeNull();
  });

  it("should delegate to Skill(tinkerman) not list subcommands", () => {
    expect(content).not.toMatch(/Skill\(forge-[a-z]/);
    expect(content).toMatch(/Skill\(tinkerman\)/);
  });
});
