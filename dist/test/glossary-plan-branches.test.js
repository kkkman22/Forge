import { describe, expect, it } from "vitest";
import { mergeAliases, normalize, parseTerms, splitBodyByArchiveSentinel, } from "../src/glossary.js";
import { detectCycleInTasks } from "../src/plan.js";
describe("glossary: normalize (branch coverage)", () => {
    it("trims + lowercases", () => {
        expect(normalize("  Hello  ")).toBe("hello");
        expect(normalize("API")).toBe("api");
    });
    it("empty string stays empty", () => {
        expect(normalize("")).toBe("");
    });
});
describe("glossary: mergeAliases (branch coverage)", () => {
    it("merges existing + incoming without duplicates", () => {
        expect(mergeAliases(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
    });
    it("handles undefined existing", () => {
        expect(mergeAliases(undefined, ["x", "y"])).toEqual(["x", "y"]);
    });
    it("handles empty incoming", () => {
        expect(mergeAliases(["a"], [])).toEqual(["a"]);
    });
    it("skips empty/whitespace aliases", () => {
        expect(mergeAliases(["a", "  ", ""], ["b"])).toEqual(["a", "b"]);
    });
    it("deduplicates case-insensitively", () => {
        expect(mergeAliases(["API"], ["api"])).toEqual(["API"]);
    });
});
describe("glossary: splitBodyByArchiveSentinel (branch coverage)", () => {
    it("splits body at archive sentinel", () => {
        const body = "term 1\n\nterm 2\n\n## Archived\n\nold term";
        const r = splitBodyByArchiveSentinel(body);
        expect(r.active).toContain("term 1");
        expect(r.archived).toContain("old term");
    });
    it("returns full body as active when no sentinel", () => {
        const r = splitBodyByArchiveSentinel("just terms\nno archive");
        expect(r.active).toBe("just terms\nno archive");
        expect(r.archived).toBe("");
    });
    it("handles empty body", () => {
        const r = splitBodyByArchiveSentinel("");
        expect(r.active).toBe("");
        expect(r.archived).toBe("");
    });
});
describe("glossary: parseTerms (branch coverage)", () => {
    it("parses terms from body without throwing", () => {
        const body = "## API\n\nApplication Programming Interface.\n";
        const terms = parseTerms(body);
        expect(Array.isArray(terms)).toBe(true);
    });
    it("returns [] for empty body", () => {
        expect(parseTerms("")).toEqual([]);
    });
    it("returns [] for body with no term headings", () => {
        expect(parseTerms("just text\nno headings")).toEqual([]);
    });
});
describe("plan: detectCycleInTasks (branch coverage)", () => {
    it("returns null for acyclic tasks", () => {
        expect(detectCycleInTasks([
            { taskNumber: 1, dependsOn: [] },
            { taskNumber: 2, dependsOn: [1] },
            { taskNumber: 3, dependsOn: [2] },
        ])).toBeNull();
    });
    it("detects a cycle", () => {
        const result = detectCycleInTasks([
            { taskNumber: 1, dependsOn: [2] },
            { taskNumber: 2, dependsOn: [1] },
        ]);
        expect(result).not.toBeNull();
    });
    it("returns null for single task with no deps", () => {
        expect(detectCycleInTasks([{ taskNumber: 1, dependsOn: [] }])).toBeNull();
    });
    it("returns null for empty task list", () => {
        expect(detectCycleInTasks([])).toBeNull();
    });
    it("handles self-dependency as a cycle", () => {
        expect(detectCycleInTasks([{ taskNumber: 1, dependsOn: [1] }])).not.toBeNull();
    });
    it("handles undefined dependsOn", () => {
        expect(detectCycleInTasks([{ taskNumber: 1 }, { taskNumber: 2 }])).toBeNull();
    });
});
//# sourceMappingURL=glossary-plan-branches.test.js.map