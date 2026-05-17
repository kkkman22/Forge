import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { glob } from "glob";
const ROOT = resolve(import.meta.dirname, "..", "..");
describe("R1.1: only one forge skill registered", () => {
    it("skills/*/SKILL.md glob returns exactly skills/forge/SKILL.md", async () => {
        const matches = await glob("skills/*/SKILL.md", { cwd: ROOT });
        expect(matches).toEqual(["skills/forge/SKILL.md"]);
    });
});
//# sourceMappingURL=skill-registration.test.js.map