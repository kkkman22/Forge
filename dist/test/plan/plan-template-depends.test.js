import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
const ATOMIC_PATH = resolve(__dirname, "../../skills/forge-plan/references/atomic-task-format.md");
const LW_PATH = resolve(__dirname, "../../skills/forge-plan/references/lightweight-task-format.md");
const DOC_PATH = resolve(__dirname, "../../skills/forge-plan/references/plan-document-format.md");
describe("Plan template — Depends On field", () => {
    it("atomic-task-format.md mentions Depends On", () => {
        const content = readFileSync(ATOMIC_PATH, "utf-8");
        expect(content.toLowerCase()).toContain("depends on");
    });
    it("lightweight-task-format.md mentions Depends On", () => {
        const content = readFileSync(LW_PATH, "utf-8");
        expect(content.toLowerCase()).toContain("depends on");
    });
    it("plan-document-format.md includes Depends On in both format templates", () => {
        const content = readFileSync(DOC_PATH, "utf-8");
        const dependsOnMentions = (content.match(/depends\s+on/gi) ?? []).length;
        expect(dependsOnMentions).toBeGreaterThanOrEqual(2);
    });
});
//# sourceMappingURL=plan-template-depends.test.js.map