/**
 * State Resilience tests — graceful parsing for StatusFile and ReviewReport.
 *
 * Tests Properties 1 and 4 from the state-resilience spec:
 *   - Property 1: Missing fields → all fields populated from defaults
 *   - Property 4: Complete valid input → identical to current parsing
 */
import { describe, expect, it } from "vitest";
import { parseReviewReportGraceful, parseStatusFileGraceful, REVIEW_REPORT_DEFAULTS, STATUS_DEFAULTS, } from "../src/state.js";
// ---------------------------------------------------------------------------
// STATUS_DEFAULTS completeness
// ---------------------------------------------------------------------------
describe("STATUS_DEFAULTS", () => {
    it("has all required StatusFile fields", () => {
        const requiredFields = [
            "current_task",
            "tier",
            "work_nature",
            "phase",
            "task_type",
            "project_phase",
            "hints",
            "mode",
            "updated",
        ];
        for (const field of requiredFields) {
            expect(STATUS_DEFAULTS).toHaveProperty(field);
        }
    });
    it("has expected default values", () => {
        expect(STATUS_DEFAULTS.current_task).toBe("");
        expect(STATUS_DEFAULTS.tier).toBe("standard");
        expect(STATUS_DEFAULTS.work_nature).toBe("feature");
        expect(STATUS_DEFAULTS.phase).toBe("router");
        expect(STATUS_DEFAULTS.task_type).toBe("fullstack");
        expect(STATUS_DEFAULTS.project_phase).toBe("iteration");
        expect(STATUS_DEFAULTS.hints).toBe("");
        expect(STATUS_DEFAULTS.mode).toBe("interactive");
        expect(STATUS_DEFAULTS.updated).toBe("");
        expect(STATUS_DEFAULTS.assumptions).toEqual([]);
    });
});
// ---------------------------------------------------------------------------
// parseStatusFileGraceful — Property 1 (missing fields → defaults)
// ---------------------------------------------------------------------------
describe("parseStatusFileGraceful", () => {
    it("returns all defaults when content is undefined", () => {
        const { parsed, warnings } = parseStatusFileGraceful(undefined);
        expect(parsed.current_task).toBe("");
        expect(parsed.tier).toBe("standard");
        expect(parsed.phase).toBe("router");
        expect(parsed.task_type).toBe("fullstack");
        expect(parsed.project_phase).toBe("iteration");
        expect(parsed.hints).toBe("");
        expect(parsed.mode).toBe("interactive");
        expect(parsed.updated).toBe("");
        expect(parsed.assumptions).toEqual([]);
        expect(warnings.length).toBeGreaterThan(0);
    });
    it("returns all defaults when content is empty string", () => {
        const { parsed, warnings } = parseStatusFileGraceful("");
        expect(parsed.current_task).toBe("");
        expect(parsed.tier).toBe("standard");
        expect(warnings.length).toBeGreaterThan(0);
    });
    it("returns all defaults when content has no frontmatter", () => {
        const { parsed, warnings } = parseStatusFileGraceful("Just some markdown text\n");
        expect(parsed.current_task).toBe("");
        expect(parsed.tier).toBe("standard");
        expect(warnings.length).toBeGreaterThan(0);
    });
    it("uses defaults for missing individual fields", () => {
        const content = `---
current_task: "my-task"
tier: "light"
phase: "build"
---
Some body`;
        const { parsed, warnings } = parseStatusFileGraceful(content);
        // Provided fields
        expect(parsed.current_task).toBe("my-task");
        expect(parsed.tier).toBe("light");
        expect(parsed.phase).toBe("build");
        // Missing fields → defaults
        expect(parsed.task_type).toBe("fullstack");
        expect(parsed.project_phase).toBe("iteration");
        expect(parsed.hints).toBe("");
        expect(parsed.mode).toBe("interactive");
        expect(parsed.updated).toBe("");
        expect(parsed.assumptions).toEqual([]);
        // Should have warnings for missing fields
        expect(warnings.length).toBeGreaterThan(0);
    });
    it("preserves all provided fields (Property 4)", () => {
        const content = `---
current_task: "test-task"
tier: "full"
work_nature: "refactor"
phase: "review"
task_type: "backend"
project_phase: "greenfield"
hints: "auth,security"
mode: "autonomous"
updated: "2026-05-01"
assumptions:
  - "assumption 1"
  - "assumption 2"
---
Body text`;
        const { parsed, warnings } = parseStatusFileGraceful(content);
        expect(parsed.current_task).toBe("test-task");
        expect(parsed.tier).toBe("full");
        expect(parsed.work_nature).toBe("refactor");
        expect(parsed.phase).toBe("review");
        expect(parsed.task_type).toBe("backend");
        expect(parsed.project_phase).toBe("greenfield");
        expect(parsed.hints).toBe("auth,security");
        expect(parsed.mode).toBe("autonomous");
        expect(parsed.updated).toBe("2026-05-01");
        expect(parsed.assumptions).toEqual(['"assumption 1"', '"assumption 2"']);
        expect(warnings).toEqual([]);
    });
    it("handles malformed YAML frontmatter gracefully", () => {
        const content = `---
current_task: "task"
tier: broken yaml here
---
Body`;
        const { parsed, warnings } = parseStatusFileGraceful(content);
        expect(parsed.current_task).toBe("task");
        // Zod schema validates tier against enum; invalid value falls back to default
        expect(parsed.tier).toBe("standard");
        expect(warnings.length).toBeGreaterThan(0);
    });
    it("parses work_nature: refactor from frontmatter", () => {
        const content = `---
current_task: "test"
tier: "standard"
work_nature: "refactor"
phase: "build"
---
Body`;
        const { parsed } = parseStatusFileGraceful(content);
        expect(parsed.work_nature).toBe("refactor");
    });
    it("defaults work_nature to feature when absent", () => {
        const content = `---
current_task: "test"
tier: "standard"
phase: "build"
---
Body`;
        const { parsed } = parseStatusFileGraceful(content);
        expect(parsed.work_nature).toBe("feature");
    });
    it("defaults work_nature to feature for empty content", () => {
        const { parsed } = parseStatusFileGraceful(undefined);
        expect(parsed.work_nature).toBe("feature");
    });
});
// ---------------------------------------------------------------------------
// REVIEW_REPORT_DEFAULTS completeness
// ---------------------------------------------------------------------------
describe("REVIEW_REPORT_DEFAULTS", () => {
    it("has all required review report fields", () => {
        const requiredFields = [
            "result",
            "p0_count",
            "p1_count",
            "p2_count",
            "p3_count",
        ];
        for (const field of requiredFields) {
            expect(REVIEW_REPORT_DEFAULTS).toHaveProperty(field);
        }
    });
    it("result defaults to 'incomplete' (safe default)", () => {
        expect(REVIEW_REPORT_DEFAULTS.result).toBe("incomplete");
    });
    it("count fields default to 0", () => {
        expect(REVIEW_REPORT_DEFAULTS.p0_count).toBe(0);
        expect(REVIEW_REPORT_DEFAULTS.p1_count).toBe(0);
        expect(REVIEW_REPORT_DEFAULTS.p2_count).toBe(0);
        expect(REVIEW_REPORT_DEFAULTS.p3_count).toBe(0);
    });
});
// ---------------------------------------------------------------------------
// parseReviewReportGraceful
// ---------------------------------------------------------------------------
describe("parseReviewReportGraceful", () => {
    it("returns all defaults when content is undefined", () => {
        const { parsed, warnings } = parseReviewReportGraceful(undefined);
        expect(parsed.result).toBe("incomplete");
        expect(parsed.p0_count).toBe(0);
        expect(parsed.p1_count).toBe(0);
        expect(parsed.p2_count).toBe(0);
        expect(parsed.p3_count).toBe(0);
        expect(warnings.length).toBeGreaterThan(0);
    });
    it("returns all defaults when content is empty", () => {
        const { parsed } = parseReviewReportGraceful("");
        expect(parsed.result).toBe("incomplete");
        expect(parsed.p0_count).toBe(0);
    });
    it("uses defaults for missing fields", () => {
        const content = `---
result: "pass"
p0_count: 0
---
Report body`;
        const { parsed, warnings } = parseReviewReportGraceful(content);
        expect(parsed.result).toBe("pass");
        expect(parsed.p0_count).toBe(0);
        // Missing p1, p2, p3 → defaults
        expect(parsed.p1_count).toBe(0);
        expect(parsed.p2_count).toBe(0);
        expect(parsed.p3_count).toBe(0);
        expect(warnings.length).toBeGreaterThan(0);
    });
    it("preserves all provided fields", () => {
        const content = `---
result: "fail"
p0_count: 2
p1_count: 3
p2_count: 1
p3_count: 0
---
Report body`;
        const { parsed, warnings } = parseReviewReportGraceful(content);
        expect(parsed.result).toBe("fail");
        expect(parsed.p0_count).toBe(2);
        expect(parsed.p1_count).toBe(3);
        expect(parsed.p2_count).toBe(1);
        expect(parsed.p3_count).toBe(0);
        expect(warnings).toEqual([]);
    });
    it("defaults result to 'incomplete' for missing result (blocks ship)", () => {
        const content = `---
p0_count: 0
p1_count: 0
---
No result field`;
        const { parsed } = parseReviewReportGraceful(content);
        // incomplete is the safe default — blocks ship
        expect(parsed.result).toBe("incomplete");
    });
});
//# sourceMappingURL=state-resilience.test.js.map