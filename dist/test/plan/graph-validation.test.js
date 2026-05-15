import { describe, it, expect } from "vitest";
import { validatePlanTasks } from "../../src/plan.js";
function makeTask(n, dependsOn = []) {
    return {
        taskNumber: n,
        title: `Task ${n}`,
        filePath: `src/f${n}.ts`,
        estimatedMinutes: 3,
        tddSteps: {
            red: { testFile: `test/f${n}.test.ts`, testCode: "t", runCommand: "npx vitest run" },
            green: { sourceFile: `src/f${n}.ts`, sourceCode: "c", runCommand: "npx vitest run" },
            refactor: "r",
        },
        verifyCommand: "npx vitest run",
        commitMessage: `m${n}`,
        dependsOn,
    };
}
describe("validatePlanTasks — graph validation", () => {
    it("rejects cycle in full format tasks", () => {
        const tasks = [
            makeTask(1, [2]),
            makeTask(2, [1]),
        ];
        expect(validatePlanTasks(tasks)).toBe(false);
    });
    it("rejects out-of-order dependencies", () => {
        const tasks = [
            makeTask(1, [2]),
            makeTask(2),
        ];
        expect(validatePlanTasks(tasks)).toBe(false);
    });
    it("accepts valid topological order with dependencies", () => {
        const tasks = [
            makeTask(1),
            makeTask(2, [1]),
            makeTask(3, [1, 2]),
        ];
        expect(validatePlanTasks(tasks)).toBe(true);
    });
    it("accepts tasks with no dependencies", () => {
        const tasks = [makeTask(1), makeTask(2)];
        expect(validatePlanTasks(tasks)).toBe(true);
    });
    it("rejects self-dependency", () => {
        const tasks = [makeTask(1, [1])];
        expect(validatePlanTasks(tasks)).toBe(false);
    });
});
//# sourceMappingURL=graph-validation.test.js.map