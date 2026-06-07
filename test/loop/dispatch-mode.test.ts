/**
 * @file Dispatch mode and frontmatter contract tests for loop skill.
 *
 * Validates that instructions.md has the correct frontmatter fields
 * and references the core loop modules (phase-transitions, three-strike,
 * scheduling-strategy, stopwhen).
 *
 * RED: Will fail if frontmatter doesn't match expected contract.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const INSTRUCTIONS_PATH = resolve(__dirname, "../../skills/forge/lib/loop/instructions.md");

function readInstructions(): string {
  return readFileSync(INSTRUCTIONS_PATH, "utf-8");
}

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error("No frontmatter found");
  const fm: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w[\w_-]*):\s*(.+)$/);
    if (kv) {
      const val = kv[2].trim();
      // Handle YAML list
      if (val.startsWith("-")) {
        fm[kv[1]] = match[1]
          .split("\n")
          .filter((l) => l.trim().startsWith("- "))
          .map((l) => l.replace(/^\s*-\s*/, "").trim());
        break;
      }
      fm[kv[1]] = val;
    }
  }
  return fm;
}

describe("Loop Skill dispatch mode", () => {
  it("instructions.md exists and is readable", () => {
    const content = readInstructions();
    expect(content.length).toBeGreaterThan(0);
  });

  it("frontmatter has dispatch_mode: fork", () => {
    const fm = parseFrontmatter(readInstructions());
    expect(fm.dispatch_mode).toBe("fork");
  });

  it("frontmatter has a description field", () => {
    const fm = parseFrontmatter(readInstructions());
    expect(fm.description).toBeDefined();
    expect(typeof fm.description).toBe("string");
    expect((fm.description as string).length).toBeGreaterThan(0);
  });

  it("instructions is <= 300 lines", () => {
    const lines = readInstructions().split("\n");
    expect(lines.length).toBeLessThanOrEqual(300);
  });
});

describe("Loop Skill module references", () => {
  const content = readInstructions();

  it("references phase-transitions module", () => {
    expect(content).toContain("phase-transitions");
  });

  it("references three-strike module", () => {
    expect(content).toContain("three-strike");
  });

  it("references scheduling-strategy module", () => {
    expect(content).toContain("scheduling-strategy");
  });

  it("references stopwhen module", () => {
    expect(content).toContain("stopwhen");
  });

  it("references package-runtime for execution package state", () => {
    expect(content).toContain("package-runtime");
    expect(content).toContain("advanceLoopAfterPhaseSuccess");
  });
});

describe("Loop Skill entry routing", () => {
  const content = readInstructions();

  it("documents /forge loop entry", () => {
    expect(content).toMatch(/\/forge loop\b/);
  });

  it("documents /forge loop continue entry", () => {
    expect(content).toMatch(/continue/);
  });

  it("documents /forge loop status entry", () => {
    expect(content).toMatch(/status/);
  });

  it("documents /forge loop abort entry", () => {
    expect(content).toMatch(/abort/);
  });
});

describe("Loop Skill tier sequences", () => {
  const content = readInstructions();

  it("documents light tier sequence", () => {
    expect(content).toMatch(/light.*build.*review|build.*review.*light/is);
  });

  it("documents standard tier sequence", () => {
    expect(content).toMatch(
      /standard.*plan.*build.*review.*test.*ship|plan.*build.*review.*test.*ship.*standard/is,
    );
  });

  it("documents full tier sequence", () => {
    expect(content).toMatch(/full.*learn|learn.*full/i);
  });
});
