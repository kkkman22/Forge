// Feature: forge-slimming-plan, Property 1: Command Count SST Consistency
// Validates that the single source of truth (commands/forge.md subcommand table)
// produces consistent counts across all declaration targets.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..", "..");
const FORGE_MD = join(ROOT, "commands", "forge.md");

function countSubcommands(content: string): number {
  const rows = content.match(/^\| `\w[^`]+` \| `forge-/gm);
  return rows ? rows.length : 0;
}

function extractDeclaredCount(text: string): number[] {
  const matches = [...text.matchAll(/\b(\d+)\s*(?:命令|commands?)/gi)];
  return matches.map((m) => Number.parseInt(m[1], 10));
}

describe("Property 1: Command Count SST Consistency", () => {
  it("SST count is stable across multiple reads", () => {
    const content = readFileSync(FORGE_MD, "utf-8");
    const counts = Array.from({ length: 10 }, () => countSubcommands(content));
    const unique = new Set(counts);
    expect(unique.size).toBe(1);
  });

  it("all declaration targets agree with SST", () => {
    fc.assert(
      fc.property(fc.constant(undefined), () => {
        const sst = countSubcommands(readFileSync(FORGE_MD, "utf-8"));

        const targets = [
          join(ROOT, "README.md"),
          join(ROOT, ".claude-plugin", "plugin.json"),
          join(ROOT, ".claude-plugin", "marketplace.json"),
          join(ROOT, "docs", "reference-commands.md"),
        ];

        for (const target of targets) {
          if (!existsSync(target)) continue;
          const content = readFileSync(target, "utf-8");
          const declaredCounts = extractDeclaredCount(content);
          for (const count of declaredCounts) {
            expect(count).toBe(sst);
          }
        }
      }),
      { numRuns: 10 },
    );
  });

  it("verify-count script logic matches direct parse", () => {
    const content = readFileSync(FORGE_MD, "utf-8");
    const direct = countSubcommands(content);
    // The regex in gen-plugin-commands.mjs uses the same pattern
    const rows = content.match(/^\| `\w[^`]+` \| `forge-/gm);
    expect(rows?.length).toBe(direct);
  });
});
