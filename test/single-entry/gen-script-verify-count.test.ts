import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = resolve(import.meta.dirname, "../../scripts/gen-plugin-commands.mjs");

function run(args: string[]) {
  return spawnSync("node", [SCRIPT, ...args], {
    encoding: "utf-8",
    timeout: 15_000,
  });
}

describe("gen-plugin-commands.mjs single-entry mode (R3)", () => {
  it("--dry-run should output 'single-entry' message", () => {
    const result = run(["--dry-run"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("single-entry");
  });

  it("--verify-count should output SST count and exit (downstream must match SST=1)", () => {
    const result = run(["--verify-count"]);
    // After downstream declarations are updated (Task 6), this should exit 0
    // SST=1 means only commands/tinkerman.md is user-facing
    const output = result.stdout + result.stderr;
    expect(output).toMatch(/SST=1/);
  });

  it("default run should not create any wrapper command files", () => {
    const result = run(["--dry-run"]);
    expect(result.status).toBe(0);
    const output = result.stdout;
    // Should NOT mention creating wrapper files
    expect(output).not.toMatch(/CREATED forge-\w+\.md/);
    expect(output).not.toMatch(/WOULD CREATE forge-\w+\.md/);
  });
});
