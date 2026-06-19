/**
 * REQ-04 (audit-remediate-0619): spec-bundle-io render functions must delegate
 * to spec-render.ts (the SSOT) so the two cannot drift.
 *
 * Before the fix, spec-bundle-io carried hand-maintained copies that had
 * drifted: requirements rendering omitted enforceEarsSyntax, design rendering
 * emitted invalid markdown for open questions (`1. ${q}` for every entry), and
 * tasks rendering dropped execution_packages. These tests pin the equivalence.
 */
import { describe, expect, it } from "vitest";
import { renderDesignMarkdown, renderRequirementsMarkdown, renderTasksMarkdown, } from "../src/spec-bundle-io.js";
import { renderDesignMarkdown as ssotRenderDesign, renderRequirementsMarkdown as ssotRenderRequirements, renderTasksMarkdown as ssotRenderTasks, } from "../src/spec-render.js";
const fm = {
    feature: "delegation-test",
    status: "locked",
    date: "2026-06-19",
};
describe("spec-bundle-io delegates to spec-render (SSOT)", () => {
    it("renderRequirementsMarkdown output is identical to spec-render", () => {
        const req = {
            frontmatter: fm,
            intro: "Intro.",
            glossary: [{ term: "T", definition: "D" }],
            userStories: [
                {
                    title: "US1",
                    description: "desc",
                    earsCriteria: [{ when: "X", shall: "Y" }],
                },
            ],
            nonFunctional: ["NFR1"],
            outOfScope: ["OOO1"],
        };
        expect(renderRequirementsMarkdown(req)).toEqual(ssotRenderRequirements(req));
    });
    it("renderDesignMarkdown output is identical to spec-render (fixes open-questions numbering)", () => {
        const design = {
            frontmatter: fm,
            overview: "ov",
            architecture: "arch",
            componentInterfaces: ["IFoo"],
            dataModel: "User { id }",
            errorHandling: "try-catch",
            testingStrategy: "vitest",
            rollout: "gradual",
            openQuestions: ["Q1?", "Q2?", "Q3?"],
        };
        const out = renderDesignMarkdown(design);
        // Pin the bug fix: open questions must be properly numbered (not all `1.`).
        expect(out).toContain("1. Q1?");
        expect(out).toContain("2. Q2?");
        expect(out).toContain("3. Q3?");
        // And identical to SSOT.
        expect(out).toEqual(ssotRenderDesign(design));
    });
    it("renderTasksMarkdown output is identical to spec-render", () => {
        const tasks = {
            frontmatter: fm,
            tasks: [
                {
                    id: "T1",
                    title: "Task 1",
                    goal: "goal",
                    related_requirements: ["REQ-1"],
                    depends_on: [],
                },
            ],
        };
        expect(renderTasksMarkdown(tasks)).toEqual(ssotRenderTasks(tasks));
    });
});
//# sourceMappingURL=spec-bundle-io-delegation.test.js.map