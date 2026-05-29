import { describe, expect, it } from "vitest";
import { classify } from "../../src/docs-governance/domains.js";
describe("baseline report generation", () => {
    it("classifies all test fixture paths correctly", () => {
        const testPaths = [
            { path: "docs/INDEX.md", expected: "A" },
            { path: "docs/reference-architecture.md", expected: "A" },
            { path: "README.md", expected: "D" },
            { path: "CHANGELOG.md", expected: "D" },
            { path: ".forge/status.md", expected: "C" },
            { path: "skills/forge/SKILL.md", expected: "B" },
            { path: "src/index.ts", expected: "B" },
            { path: "node_modules/x/readme.md", expected: "EXCLUDED" },
        ];
        for (const { path, expected } of testPaths) {
            expect(classify(path)).toBe(expected);
        }
    });
    it("detects UNCLASSIFIED paths", () => {
        const unclassified = classify("random-dir/file.md");
        expect(unclassified).toBe("UNCLASSIFIED");
    });
});
//# sourceMappingURL=baseline.test.js.map