import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { glob } from "glob";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..");

describe("R2.8 sec sub-check: no absolute paths in lib + registry", () => {
  it("lib must contain 29 instructions.md (Task 6 prerequisite)", async () => {
    const libs = await glob("skills/tinkerman/lib/*/instructions.md", { cwd: ROOT });
    expect(libs.length).toBeGreaterThanOrEqual(29);
  });

  it("lib/ contains no absolute path prefixes", async () => {
    const files = await glob("skills/tinkerman/lib/**/*.md", { cwd: ROOT });
    const registryFiles = await glob("skills/tinkerman/registry.toml", { cwd: ROOT });
    const allFiles = [...files, ...registryFiles];

    const violations: string[] = [];
    const ABSOLUTE_PATTERN = /\/Users\/|\/home\/|\/etc\/|C:\\|D:\\"/;

    for (const file of allFiles) {
      const content = readFileSync(resolve(ROOT, file), "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (ABSOLUTE_PATTERN.test(lines[i])) {
          violations.push(`${file}:${i + 1}: ${lines[i].trim()}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
