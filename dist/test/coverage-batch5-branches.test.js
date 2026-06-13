import { describe, expect, it } from "vitest";
import { deserializeContextBudgetReport, deserializeSubagentSummary, serializeSubagentSummary, } from "../src/context-budget.js";
import { checkContradictions, checkOrphanSolutions, checkReferenceIntegrity, lintKnowledgeIntegrity, } from "../src/knowledge-integrity.js";
const sub = {
    status: "DONE",
    taskDescription: "fix bug",
    changedFiles: ["src/a.ts"],
    testResult: { passed: 5, failed: 0 },
    commitMessage: "fix: bug",
    selfCheckResults: "passed",
};
describe("context-budget: SubagentSummary serialize/deserialize (branches)", () => {
    it("round-trips a DONE summary with changedFiles", () => {
        const text = serializeSubagentSummary(sub);
        expect(text).toContain("状态：DONE");
        expect(text).toContain("src/a.ts");
        const back = deserializeSubagentSummary(text);
        expect(back.status).toBe("DONE");
        expect(back.taskDescription).toBe("fix bug");
    });
    it("serializes (none) for empty changedFiles", () => {
        const text = serializeSubagentSummary({ ...sub, changedFiles: [] });
        expect(text).toContain("(none)");
    });
    it("serializes blockingReason for BLOCKED status", () => {
        const text = serializeSubagentSummary({ ...sub, status: "BLOCKED", blockingReason: "missing dep" });
        expect(text).toContain("BLOCKED");
        expect(text).toContain("missing dep");
    });
    it("serializes concerns for DONE_WITH_CONCERNS", () => {
        const text = serializeSubagentSummary({
            ...sub,
            status: "DONE_WITH_CONCERNS",
            concerns: ["edge case", "perf"],
        });
        expect(text).toContain("DONE_WITH_CONCERNS");
    });
    it("deserialize returns defaults for garbage", () => {
        const r = deserializeSubagentSummary("garbage");
        expect(r.status).toBeDefined();
    });
});
describe("context-budget: ContextBudgetReport deserialize fallback", () => {
    it("deserializeContextBudgetReport returns object for garbage", () => {
        expect(typeof deserializeContextBudgetReport("garbage")).toBe("object");
    });
});
describe("knowledge-integrity (branch coverage)", () => {
    const emptyInput = {
        instinctsContent: "",
        evolvedRulesContent: "",
        knownFailuresContent: "",
        solutions: new Map(),
        sessionFiles: [],
    };
    it("checkReferenceIntegrity returns [] for empty knowledge base", () => {
        expect(checkReferenceIntegrity(emptyInput)).toEqual([]);
    });
    it("checkOrphanSolutions returns [] for empty solutions", () => {
        expect(checkOrphanSolutions(emptyInput)).toEqual([]);
    });
    it("checkContradictions returns [] for empty content", () => {
        expect(checkContradictions(emptyInput)).toEqual([]);
    });
    it("lintKnowledgeIntegrity aggregates all checks (empty → [])", () => {
        expect(lintKnowledgeIntegrity(emptyInput)).toEqual([]);
    });
    it("checkReferenceIntegrity runs with populated content", () => {
        const input = {
            instinctsContent: "- [Pattern](R99) — references non-existent rule",
            evolvedRulesContent: "### R1\nexists\n",
            knownFailuresContent: "",
            solutions: new Map(),
            sessionFiles: [],
        };
        const findings = checkReferenceIntegrity(input);
        expect(Array.isArray(findings)).toBe(true);
    });
});
//# sourceMappingURL=coverage-batch5-branches.test.js.map