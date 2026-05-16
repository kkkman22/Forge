import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const FORGE_MD = resolve(import.meta.dirname, "../../commands/forge.md");
const content = readFileSync(FORGE_MD, "utf-8");

const CORE_SUBCOMMANDS = [
  "plan",
  "build",
  "review",
  "test",
  "ship",
  "learn",
  "decide",
  "spec",
  "debug",
  "loop",
  "status",
  "resume",
  "abort",
] as const;

describe("commands/forge.md subcommand table (R1)", () => {
  it("should list all 13 core subcommands", () => {
    for (const sub of CORE_SUBCOMMANDS) {
      const re = new RegExp(`\\| \`${sub}\` \\|`);
      expect(content, `subcommand '${sub}' missing from table`).toMatch(re);
    }
  });

  it("should have a subcommand dispatch table with at least 13 rows", () => {
    const tableRows = content.match(/^\| `\w[\w-]*` \|/gm);
    expect(tableRows?.length ?? 0).toBeGreaterThanOrEqual(13);
  });
});
