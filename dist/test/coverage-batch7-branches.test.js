import { describe, expect, it } from "vitest";
import { buildSkipGateAnnotation, checkPackageCompletionGate, generateP1Fixlist, parseP1Fixlist, updateFixlistWithCommits, } from "../src/ship-gates.js";
describe("buildSkipGateAnnotation (all branches)", () => {
    it("skipAll + force → forced-by-user annotation", () => {
        const r = buildSkipGateAnnotation({
            skipAll: true,
            skipGates: [],
            force: true,
            isInteractive: false,
        });
        expect(r).toContain("all");
        expect(r).toContain("forced-by-user");
    });
    it("empty skipGates → empty string", () => {
        expect(buildSkipGateAnnotation({
            skipAll: false,
            skipGates: [],
            force: false,
            isInteractive: false,
        })).toBe("");
    });
    it("individual gates → individual-skip annotation", () => {
        const r = buildSkipGateAnnotation({
            skipAll: false,
            skipGates: ["review"],
            force: false,
            isInteractive: false,
        });
        expect(r).toContain("review");
        expect(r).toContain("individual-skip");
    });
    it("multiple gates joined by comma", () => {
        const r = buildSkipGateAnnotation({
            skipAll: false,
            skipGates: ["review", "test"],
            force: false,
            isInteractive: false,
        });
        expect(r).toContain("review,test");
    });
});
describe("generateP1Fixlist (branch coverage)", () => {
    it("filters only P1 findings (not P0/P2/P3)", () => {
        const fixlist = generateP1Fixlist("run-1", [
            { severity: "P0", filePath: "a.ts", lineNumber: 1, description: "critical" },
            { severity: "P1", filePath: "b.ts", lineNumber: 2, description: "high" },
            { severity: "P2", filePath: "c.ts", lineNumber: 3, description: "medium" },
        ]);
        expect(fixlist.p1Issues.length).toBe(1);
        expect(fixlist.p1Issues[0].title).toBe("high");
    });
    it("empty findings → empty fixlist + allFixed=true", () => {
        const fixlist = generateP1Fixlist("run-1", []);
        expect(fixlist.p1Issues).toEqual([]);
        expect(fixlist.allFixed).toBe(true);
    });
    it("assigns sequential P1-NNN IDs", () => {
        const fixlist = generateP1Fixlist("run-1", [
            { severity: "P1", filePath: "a.ts", lineNumber: 1, description: "x" },
            { severity: "P1", filePath: "b.ts", lineNumber: 2, description: "y" },
        ]);
        expect(fixlist.p1Issues[0].id).toBe("P1-001");
        expect(fixlist.p1Issues[1].id).toBe("P1-002");
    });
});
describe("updateFixlistWithCommits (branch coverage)", () => {
    it("marks issue fixed when commit matches [fix P1]", () => {
        const fixlist = generateP1Fixlist("run-1", [
            { severity: "P1", filePath: "a.ts", lineNumber: 1, description: "x" },
        ]);
        const updated = updateFixlistWithCommits(fixlist, () => ["abc1234 [fix P1] fix the issue"]);
        expect(updated.p1Issues[0].fixCommit).toBe("abc1234");
    });
    it("leaves issue unfixed when no matching commit", () => {
        const fixlist = generateP1Fixlist("run-1", [
            { severity: "P1", filePath: "a.ts", lineNumber: 1, description: "x" },
        ]);
        const updated = updateFixlistWithCommits(fixlist, () => ["def5678 unrelated commit"]);
        expect(updated.p1Issues[0].fixCommit).toBeNull();
    });
    it("skips already-fixed issues", () => {
        const fixlist = generateP1Fixlist("run-1", [
            { severity: "P1", filePath: "a.ts", lineNumber: 1, description: "x" },
        ]);
        fixlist.p1Issues[0].fixCommit = "already-fixed";
        const updated = updateFixlistWithCommits(fixlist, () => ["new1234 [fix P1]"]);
        expect(updated.p1Issues[0].fixCommit).toBe("already-fixed");
    });
});
describe("parseP1Fixlist (branch coverage)", () => {
    it("returns null for empty content", () => {
        expect(parseP1Fixlist("")).toBeNull();
    });
    it("returns null for non-fixlist content", () => {
        expect(parseP1Fixlist("just some text")).toBeNull();
    });
});
describe("checkPackageCompletionGate (branch coverage)", () => {
    const input = (completed, severity = "block") => ({
        executionPackages: [
            { id: "P1", tasks: [] },
            { id: "P2", tasks: [] },
            { id: "P3", tasks: [] },
        ],
        completedPackages: completed,
        severity,
    });
    it("passes when all packages completed", () => {
        const r = checkPackageCompletionGate(input(["P1", "P2", "P3"]));
        expect(r.passed).toBe(true);
        expect(r.reason).toContain("All 3");
    });
    it("blocks when packages incomplete (severity=block)", () => {
        const r = checkPackageCompletionGate(input(["P1"]));
        expect(r.passed).toBe(false);
        expect(r.reason).toContain("Incomplete");
        expect(r.reason).toContain("P2");
        expect(r.reason).toContain("P3");
    });
    it("warns but passes when packages incomplete (severity=warn)", () => {
        const r = checkPackageCompletionGate(input(["P1"], "warn"));
        expect(r.passed).toBe(true);
        expect(r.reason).toContain("warning");
    });
    it("passes when no execution packages", () => {
        const r = checkPackageCompletionGate({
            executionPackages: [],
            completedPackages: [],
            severity: "block",
        });
        expect(r.passed).toBe(true);
    });
});
//# sourceMappingURL=coverage-batch7-branches.test.js.map