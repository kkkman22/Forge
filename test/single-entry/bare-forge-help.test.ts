import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";

const ROOT = resolve(import.meta.dirname, "..", "..");
const SKILL_PATH = resolve(ROOT, "skills/forge/SKILL.md");

const SUBS = [
  "abort",
  "accept",
  "build",
  "build-light",
  "control-cli",
  "control-ui",
  "debug",
  "decide",
  "decide-teams",
  "fix",
  "fix-conflicts",
  "grill",
  "learn",
  "loop",
  "mutate",
  "pack",
  "plan",
  "recap",
  "refactor",
  "resume",
  "review",
  "router",
  "ship",
  "spec",
  "status",
  "storm",
  "test",
  "verify",
  "zoom-out",
];

const TIER_HEADINGS = ["Light", "Standard", "Full", "Auxiliary"];

describe("R1.3: bare /forge lists all 29 subcommands in 4 tiers", () => {
  it("skills/forge/SKILL.md exists", () => {
    expect(existsSync(SKILL_PATH)).toBe(true);
  });

  it("contains all 29 subcommand names", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");

    for (const sub of SUBS) {
      expect(
        content,
        `missing subcommand: ${sub}`,
      ).toContain(sub);
    }
  });

  it("contains 4 tier group headings", () => {
    const content = readFileSync(SKILL_PATH, "utf-8");

    for (const heading of TIER_HEADINGS) {
      expect(
        content,
        `missing tier heading: ${heading}`,
      ).toMatch(new RegExp(`##.*${heading}`, "i"));
    }
  });
});
