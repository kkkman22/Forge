import { describe, expect, it } from "vitest";
import { renderTasksMarkdown } from "../src/spec-render.js";
describe("renderTasksMarkdown execution packages", () => {
    const baseDoc = {
        frontmatter: {
            feature: "pkg-demo",
            status: "locked",
            date: "2026-06-08",
            workflow_variant: "requirements-first",
        },
        tasks: [
            {
                id: "T-01",
                title: "One",
                goal: "Do one",
                related_requirements: ["R1"],
                status: "pending",
            },
            {
                id: "T-02",
                title: "Two",
                goal: "Do two",
                related_requirements: ["R1"],
                status: "pending",
            },
        ],
        execution_packages: [
            {
                id: "P1",
                name: "Foundation",
                tasks: ["T-01", "T-02"],
                depends_on_packages: [],
                boundary_reason: "small package",
                estimated_loc: 120,
                files_touched: 3,
                verify_command: "npx vitest run test/demo.test.ts",
                handoff_path: ".forge/runs/run-1/packages/P1.md",
            },
        ],
    };
    it("renders execution package metadata as parseable JSON", () => {
        const markdown = renderTasksMarkdown(baseDoc);
        expect(markdown).toContain("## Execution Packages");
        expect(markdown).toContain('"execution_packages"');
        expect(markdown).toContain('"id": "P1"');
        expect(markdown).toContain('"handoff_path"');
    });
    it("does not render package section when packages are absent", () => {
        const markdown = renderTasksMarkdown({ ...baseDoc, execution_packages: undefined });
        expect(markdown).not.toContain("## Execution Packages");
    });
});
//# sourceMappingURL=spec-render-package.test.js.map