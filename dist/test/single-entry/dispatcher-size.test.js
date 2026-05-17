import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
const ROOT = resolve(import.meta.dirname, "..", "..");
const SKILL_PATH = resolve(ROOT, "skills/forge/SKILL.md");
describe("R5.3: dispatcher SKILL.md size ≤ 250 lines", () => {
    it("skills/forge/SKILL.md exists", () => {
        expect(existsSync(SKILL_PATH)).toBe(true);
    });
    it("line count ≤ 250", () => {
        const content = readFileSync(SKILL_PATH, "utf-8");
        const lineCount = content.split("\n").length;
        expect(lineCount).toBeLessThanOrEqual(250);
    });
});
//# sourceMappingURL=dispatcher-size.test.js.map