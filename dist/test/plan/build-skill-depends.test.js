import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
const SKILL_PATH = resolve(__dirname, "../../skills/forge-build/SKILL.md");
describe("Build SKILL.md — dependsOn awareness", () => {
    it("§3.2 references dependsOn or topological order", () => {
        const content = readFileSync(SKILL_PATH, "utf-8");
        expect(content.toLowerCase()).toMatch(/depends\s*on|topological|dep\s*graph/);
    });
});
//# sourceMappingURL=build-skill-depends.test.js.map