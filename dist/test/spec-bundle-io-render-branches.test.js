import { describe, expect, it } from "vitest";
import { renderDesignMarkdown, renderTasksMarkdown } from "../src/spec-bundle-io.js";
const fm = {
    feature: "test",
    status: "locked",
    date: "2026-06-14",
    workflow_variant: "requirements-first",
};
const fullDesign = {
    frontmatter: fm,
    overview: "Overview text.",
    architecture: "Layered architecture.",
    componentInterfaces: [],
    dataModel: "",
    errorHandling: "try-catch",
    testingStrategy: "vitest",
    rollout: "gradual",
    openQuestions: [],
};
describe("renderDesignMarkdown (branch coverage)", () => {
    it("renders minimal design (no optional sections)", () => {
        const out = renderDesignMarkdown({ ...fullDesign });
        expect(out).toContain("# Design Document");
        expect(out).toContain("Overview text.");
        expect(out).toContain("Layered architecture.");
    });
    it("renders component interfaces when present", () => {
        const out = renderDesignMarkdown({
            ...fullDesign,
            componentInterfaces: ["IFoo", "IBar"],
        });
        expect(out).toContain("IFoo");
        expect(out).toContain("IBar");
    });
    it("renders data model when present", () => {
        const out = renderDesignMarkdown({ ...fullDesign, dataModel: "User { id, name }" });
        expect(out).toContain("User { id, name }");
    });
    it("renders current state + proposed change + reversibility", () => {
        const out = renderDesignMarkdown({
            ...fullDesign,
            currentState: "old code",
            proposedChange: "new code",
            reversibility: "reversible",
        });
        expect(out).toContain("old code");
        expect(out).toContain("new code");
        expect(out).toContain("reversible");
    });
    it("renders open questions when present", () => {
        const out = renderDesignMarkdown({ ...fullDesign, openQuestions: ["Q1?", "Q2?"] });
        expect(out).toContain("Q1?");
    });
});
describe("renderTasksMarkdown (branch coverage)", () => {
    it("renders minimal tasks (no waves, no tasks)", () => {
        const out = renderTasksMarkdown({ frontmatter: fm, tasks: [] });
        expect(out).toContain("# Implementation Plan");
        expect(out).toContain("## Tasks");
    });
    it("renders waves when present", () => {
        const out = renderTasksMarkdown({
            frontmatter: fm,
            tasks: [],
            waves: [{ name: "Wave 1", tasks: ["T1"] }],
        });
        expect(out).toContain("Task Dependency Graph");
        expect(out).toContain("Wave 1");
    });
    it("renders tasks with goals + requirements + depends_on", () => {
        const out = renderTasksMarkdown({
            frontmatter: fm,
            tasks: [
                {
                    id: "T1",
                    title: "First task",
                    goal: "Do the thing",
                    related_requirements: ["REQ-1", "REQ-2"],
                    depends_on: ["T0"],
                    status: "pending",
                },
            ],
        });
        expect(out).toContain("T1 First task");
        expect(out).toContain("Do the thing");
        expect(out).toContain("REQ-1");
        expect(out).toContain("T0");
    });
    it("renders tasks without requirements/depends_on (skip branches)", () => {
        const out = renderTasksMarkdown({
            frontmatter: fm,
            tasks: [
                {
                    id: "T1",
                    title: "Standalone",
                    goal: "Independent",
                    related_requirements: [],
                    status: "pending",
                },
            ],
        });
        expect(out).toContain("Standalone");
    });
});
//# sourceMappingURL=spec-bundle-io-render-branches.test.js.map