import { describe, expect, it } from "vitest";
import { renderFrontmatter, renderRequirementsMarkdown } from "../src/spec-bundle-io.js";
const fm = {
    feature: "test-feature",
    status: "locked",
    date: "2026-06-14",
    workflow_variant: "requirements-first",
};
describe("renderFrontmatter (branch coverage)", () => {
    it("renders basic frontmatter", () => {
        const out = renderFrontmatter(fm);
        expect(out).toContain("---");
        expect(out).toContain("feature: test-feature");
    });
    it("renders optional fields when present", () => {
        const out = renderFrontmatter({
            ...fm,
            kind: "feature",
            brownfield: true,
            migrated_from: "legacy",
        });
        expect(out).toContain("feature: test-feature");
    });
});
describe("renderRequirementsMarkdown (branch coverage)", () => {
    it("renders a minimal requirements doc", () => {
        const out = renderRequirementsMarkdown({
            frontmatter: fm,
            intro: "This is the intro.",
            glossary: [],
            userStories: [],
            earsCriteria: [],
            nonFunctional: [],
            outOfScope: [],
        });
        expect(out).toContain("# Requirements Document");
        expect(out).toContain("This is the intro.");
    });
    it("renders with glossary entries", () => {
        const out = renderRequirementsMarkdown({
            frontmatter: fm,
            intro: "intro",
            glossary: [{ term: "API", definition: "App Prog Iface" }],
            userStories: [],
            earsCriteria: [],
            nonFunctional: [],
            outOfScope: [],
        });
        expect(out).toContain("API");
    });
    it("renders with user stories", () => {
        const out = renderRequirementsMarkdown({
            frontmatter: fm,
            intro: "intro",
            glossary: [],
            userStories: [{ title: "Login", description: "As a user", earsCriteria: [] }],
            earsCriteria: [],
            nonFunctional: [],
            outOfScope: [],
        });
        expect(out).toContain("Login");
    });
    it("renders with non-functional + out-of-scope + delta", () => {
        const out = renderRequirementsMarkdown({
            frontmatter: fm,
            intro: "intro",
            glossary: [],
            userStories: [],
            earsCriteria: [],
            nonFunctional: ["Performance: <100ms"],
            outOfScope: ["Mobile app"],
            delta: { added: ["new.ts"], modified: ["old.ts"], unchanged: ["keep.ts"] },
        });
        expect(out).toContain("Performance");
        expect(out).toContain("Mobile app");
    });
});
//# sourceMappingURL=spec-bundle-io-branches.test.js.map