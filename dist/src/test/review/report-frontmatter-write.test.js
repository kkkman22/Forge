import { describe, expect, it } from "vitest";
describe("ReviewReportFrontmatter — methodology field", () => {
    it("includes methodology field with default subagent-parallel", () => {
        const fm = {
            topic: "test-feature",
            date: "2026-05-17",
            result: "pass",
            reviewed_at_commit: "abc123",
            p0_count: 0,
            p1_count: 0,
            p2_count: 1,
            p3_count: 0,
            methodology: "subagent-parallel",
        };
        expect(fm.methodology).toBe("subagent-parallel");
    });
    it("accepts custom methodology argument", () => {
        const fm = {
            topic: "test-feature",
            date: "2026-05-17",
            result: "blocked",
            reviewed_at_commit: "abc123",
            p0_count: 1,
            p1_count: 0,
            p2_count: 0,
            p3_count: 0,
            methodology: "unavailable",
        };
        expect(fm.methodology).toBe("unavailable");
    });
});
//# sourceMappingURL=report-frontmatter-write.test.js.map