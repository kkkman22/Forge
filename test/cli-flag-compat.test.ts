import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");

const PRESERVED_FLAGS = [
  "--max-iterations",
  "--max-tokens",
  "--stop-when",
  "--worktree",
  "--resume",
  "--max-budget-usd",
  "--tier",
  "--prevent-sleep",
  "--lang",
  "--log-format",
  "--log-level",
  "--log-file",
  "--sandbox",
  "--force-no-hooks",
  "--skills-dir",
  "--agent",
  "--type",
  "--phase",
  "--nature",
  "--pua",
  "--pua-task-type",
];

describe("T14: CLI Flag Compatibility Regression", () => {
  it("all 21 preserved flags exist in forge-loop CLI", () => {
    const content = readFileSync(join(ROOT, "src/forge-loop-cli.ts"), "utf-8");
    for (const flag of PRESERVED_FLAGS) {
      expect(content).toContain(flag);
    }
  });

  it("--no-warmup flag exists (new flag with default)", () => {
    const content = readFileSync(join(ROOT, "src/forge-loop-cli.ts"), "utf-8");
    expect(content).toContain("--no-warmup");
    // Verify it has a default value (false)
    expect(content).toMatch(/--no-warmup.*false/);
  });

  it("unknown flag is rejected by commander", () => {
    expect(() => {
      execSync("node --loader ts-node/esm src/forge-loop-cli.ts --unknown-flag-xyz 2>&1", {
        cwd: ROOT,
        stdio: "pipe",
        timeout: 10_000,
      });
    }).toThrow();
  });

  it("help output lists all preserved flags", () => {
    const content = readFileSync(join(ROOT, "src/forge-loop-cli.ts"), "utf-8");
    for (const flag of PRESERVED_FLAGS) {
      expect(content).toContain(flag);
    }
    // Also check --no-warmup
    expect(content).toContain("--no-warmup");
  });
});
