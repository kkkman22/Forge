import { describe, expect, it } from "vitest";
import { lintScenarios } from "../src/scenario-linter.js";
const FILE = "spec.md";
describe("lintScenarios — SCN001: period termination", () => {
    it("reports error for Given/When/Then line without period", () => {
        const spec = [
            "## Scenarios",
            "### Scenario 1: test",
            "```gherkin",
            "Given a precondition",
            "When an action",
            "Then a result",
            "```",
        ].join("\n");
        const findings = lintScenarios(spec, FILE);
        const scn001 = findings.filter((f) => f.ruleId === "SCN001");
        expect(scn001.length).toBe(3);
        expect(scn001.every((f) => f.severity === "error")).toBe(true);
    });
    it("passes for lines ending with period", () => {
        const spec = [
            "## Scenarios",
            "### Scenario 1: test",
            "```gherkin",
            "Given a precondition.",
            "When an action.",
            "Then a result.",
            "```",
        ].join("\n");
        const scn001 = lintScenarios(spec, FILE).filter((f) => f.ruleId === "SCN001");
        expect(scn001).toEqual([]);
    });
    it("passes for lines ending with Chinese period", () => {
        const spec = [
            "## Scenarios",
            "### Scenario 1: test",
            "```gherkin",
            "Given 前提条件。",
            "When 操作。",
            "Then 结果。",
            "```",
        ].join("\n");
        const scn001 = lintScenarios(spec, FILE).filter((f) => f.ruleId === "SCN001");
        expect(scn001).toEqual([]);
    });
});
describe("lintScenarios — SCN002: structure completeness", () => {
    it("reports error for scenario missing Then", () => {
        const spec = [
            "## Scenarios",
            "### Scenario 1: incomplete",
            "```gherkin",
            "Given something.",
            "When something.",
            "```",
        ].join("\n");
        const findings = lintScenarios(spec, FILE).filter((f) => f.ruleId === "SCN002");
        expect(findings.length).toBe(1);
    });
    it("passes for complete scenario with Given/When/Then", () => {
        const spec = [
            "## Scenarios",
            "### Scenario 1: complete",
            "```gherkin",
            "Given a.",
            "When b.",
            "Then c.",
            "```",
        ].join("\n");
        const scn002 = lintScenarios(spec, FILE).filter((f) => f.ruleId === "SCN002");
        expect(scn002).toEqual([]);
    });
});
describe("lintScenarios — SCN003: externally observable Then", () => {
    it("reports error for Then referencing internal database state", () => {
        const spec = [
            "## Scenarios",
            "### Scenario 1: internal",
            "```gherkin",
            "Given a.",
            "When b.",
            "Then database contains the record.",
            "```",
        ].join("\n");
        const findings = lintScenarios(spec, FILE).filter((f) => f.ruleId === "SCN003");
        expect(findings.length).toBe(1);
    });
    it("passes for Then describing external outcome", () => {
        const spec = [
            "## Scenarios",
            "### Scenario 1: external",
            "```gherkin",
            "Given a.",
            "When b.",
            "Then the user receives a confirmation email.",
            "```",
        ].join("\n");
        const scn003 = lintScenarios(spec, FILE).filter((f) => f.ruleId === "SCN003");
        expect(scn003).toEqual([]);
    });
});
describe("lintScenarios — SCN004: scenario title format", () => {
    it("reports warning for mixed camelCase in title", () => {
        const spec = [
            "## Scenarios",
            "### Scenario CreateUser: test",
            "```gherkin",
            "Given a.",
            "When b.",
            "Then c.",
            "```",
        ].join("\n");
        const findings = lintScenarios(spec, FILE).filter((f) => f.ruleId === "SCN004");
        expect(findings.length).toBe(1);
        expect(findings[0].severity).toBe("warning");
    });
    it("passes for kebab-case title", () => {
        const spec = [
            "## Scenarios",
            "### Scenario create-user: test",
            "```gherkin",
            "Given a.",
            "When b.",
            "Then c.",
            "```",
        ].join("\n");
        const scn004 = lintScenarios(spec, FILE).filter((f) => f.ruleId === "SCN004");
        expect(scn004).toEqual([]);
    });
    it("passes for Chinese title", () => {
        const spec = [
            "## Scenarios",
            "### Scenario 创建用户: test",
            "```gherkin",
            "Given a.",
            "When b.",
            "Then c.",
            "```",
        ].join("\n");
        const scn004 = lintScenarios(spec, FILE).filter((f) => f.ruleId === "SCN004");
        expect(scn004).toEqual([]);
    });
});
describe("lintScenarios — general", () => {
    it("returns empty for spec without Scenarios section", () => {
        const spec = "# No scenarios here\n\nJust a plain spec.";
        expect(lintScenarios(spec, FILE)).toEqual([]);
    });
    it("handles multiple scenarios", () => {
        const spec = [
            "## Scenarios",
            "### Scenario 1: first",
            "```gherkin",
            "Given a.",
            "When b.",
            "Then c.",
            "```",
            "### Scenario 2: second",
            "```gherkin",
            "Given x",
            "When y.",
            "Then z.",
            "```",
        ].join("\n");
        const findings = lintScenarios(spec, FILE);
        // Scenario 2 Given "x" lacks period
        expect(findings.some((f) => f.ruleId === "SCN001")).toBe(true);
    });
});
//# sourceMappingURL=scenario-linter.test.js.map