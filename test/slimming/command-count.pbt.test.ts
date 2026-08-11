// Feature: forge-slimming-plan, Property 1: Command Count SST Consistency
// Validates that the single source of truth (skills/tinkerman/SKILL.md subcommand listing)
// produces consistent counts across all declaration targets.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const SKILL_MD = join(ROOT, "skills", "tinkerman", "SKILL.md");

const AUXILIARY_HEADING = "### Auxiliary";

function extractSubcommandsFromSkill(content: string): string[] {
  const sections = ["### Light Tier", "### Standard Tier", "### Full Tier", AUXILIARY_HEADING];
  const subs: string[] = [];
  for (const section of sections) {
    const idx = content.indexOf(section);
    if (idx === -1) continue;
    const nextSection = content.indexOf("\n### ", idx + section.length);
    const block = nextSection === -1 ? content.slice(idx) : content.slice(idx, nextSection);
    const matches = block.matchAll(/`(\w[\w-]*)`/g);
    for (const m of matches) {
      subs.push(m[1]);
    }
  }
  return [...new Set(subs)];
}

function extractDeclaredCount(text: string): number[] {
  const matches = [...text.matchAll(/\b(\d+)\s*(?:命令|commands?|sub-skills?)/gi)];
  return matches.map((m) => Number.parseInt(m[1], 10));
}

describe("Property 1: Command Count SST Consistency", () => {
  it("SST count is stable across multiple reads", () => {
    const content = readFileSync(SKILL_MD, "utf-8");
    const counts = Array.from({ length: 10 }, () => extractSubcommandsFromSkill(content).length);
    const unique = new Set(counts);
    expect(unique.size).toBe(1);
  });

  it("all declaration targets agree with SST", () => {
    fc.assert(
      fc.property(fc.constant(undefined), () => {
        const sst = extractSubcommandsFromSkill(readFileSync(SKILL_MD, "utf-8")).length;

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

  it("subcommand extraction matches direct auxiliary section parse", () => {
    const content = readFileSync(SKILL_MD, "utf-8");
    const allSubs = extractSubcommandsFromSkill(content);
    const auxIdx = content.indexOf(AUXILIARY_HEADING);
    expect(auxIdx).toBeGreaterThan(-1);
    const auxBlock = content.slice(auxIdx);
    const auxMatches = auxBlock.matchAll(/`(\w[\w-]*)`/g);
    const auxSubs = [...auxMatches].map((m) => m[1]);
    expect(auxSubs.length).toBeGreaterThan(0);
    expect(allSubs.length).toBeGreaterThanOrEqual(auxSubs.length);
  });
});
