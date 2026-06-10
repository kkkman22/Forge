import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
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
            expect(content, `missing subcommand: ${sub}`).toContain(sub);
        }
    });
    it("contains 4 tier group headings", () => {
        const content = readFileSync(SKILL_PATH, "utf-8");
        for (const heading of TIER_HEADINGS) {
            expect(content, `missing tier heading: ${heading}`).toMatch(new RegExp(`##.*${heading}`, "i"));
        }
    });
    it("documents automatic phase worker runtime behind the /forge entry", () => {
        const content = readFileSync(SKILL_PATH, "utf-8");
        expect(content).toContain("Phase Worker Runtime");
        expect(content).toContain("No manual new Claude Code window");
        expect(content).toContain("forge-phase-worker.mjs");
        expect(content).toContain("forge-sync-runtime.mjs");
    });
});
//# sourceMappingURL=bare-forge-help.test.js.map