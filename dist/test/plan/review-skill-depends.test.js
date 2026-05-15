import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
const SKILL_PATH = resolve(__dirname, "../../skills/forge-review/SKILL.md");
describe("Review SKILL.md — Layer 2 dependency order check", () => {
    it("Layer 2 mentions commit order vs dependency graph", () => {
        const content = readFileSync(SKILL_PATH, "utf-8");
        expect(content.toLowerCase()).toMatch(/commit.*(order|sequence).*(depend|topo)|(depend|topo).*(commit.*(order|sequence))/);
    });
});
//# sourceMappingURL=review-skill-depends.test.js.map