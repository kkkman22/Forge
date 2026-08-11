import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { glob } from "glob";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..");

const EXCLUDE_DIRS = [
  ".tinkerman/decisions",
  ".kiro/specs",
  ".tinkerman/archive",
  ".tinkerman/reviews",
  ".tinkerman/findings",
  ".tinkerman/poc",
  ".tinkerman/knowledge",
  "test/single-entry",
  "commands",
];

const EXCLUDE_PATTERNS = EXCLUDE_DIRS.map((d) => `**/${d}/**`);

describe("R1.5: no Skill(forge-X) references outside excluded paths", () => {
  it("no file contains Skill(forge-<sub>) call pattern", async () => {
    const patterns = [
      "skills/**/*.md",
      "commands/**/*.md",
      "agents/**/*.md",
      "src/**/*.ts",
      "scripts/**/*.mjs",
      "docs/**/*.md",
      "README.md",
      "ROADMAP.md",
      "CHANGELOG.md",
    ];

    const files = await glob(patterns, {
      cwd: ROOT,
      ignore: EXCLUDE_PATTERNS,
    });

    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(resolve(ROOT, file), "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/Skill\(forge-[a-z]/.test(lines[i])) {
          violations.push(`${file}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
