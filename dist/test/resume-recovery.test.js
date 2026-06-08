/**
 * Resume recovery tests — recoverPhase integration.
 */
import { describe, expect, it } from "vitest";
import { generateResumeOutput, recoverPhase } from "../src/resume.js";
describe("recoverPhase", () => {
    it("uses StatusFile phase when present and non-default", () => {
        const content = `---
current_task: "my-task"
tier: "standard"
phase: "build"
task_type: "fullstack"
---
Body`;
        const result = recoverPhase(content, ["progress/my-task.md"]);
        expect(result.phase).toBe("build");
        expect(result.reconstructed).toBe(false);
        expect(result.statusFields).not.toBeNull();
        expect(result.reconstruction).toBeNull();
    });
    it("reconstructs from forge files when StatusFile is undefined", () => {
        const result = recoverPhase(undefined, ["progress/my-task.md"]);
        expect(result.phase).toBe("build");
        expect(result.reconstructed).toBe(true);
        expect(result.reconstruction).not.toBeNull();
        expect(result.reconstruction?.confidence).toBe("high");
    });
    it("reconstructs from forge files when StatusFile is empty", () => {
        const result = recoverPhase("", ["reviews/my-task.md"]);
        expect(result.phase).toBe("review");
        expect(result.reconstructed).toBe(true);
    });
    it("returns router when nothing available", () => {
        const result = recoverPhase(undefined, []);
        expect(result.phase).toBe("router");
        expect(result.reconstructed).toBe(true);
        expect(result.reconstruction?.confidence).toBe("low");
    });
    it("prefers StatusFile over reconstruction when phase is set", () => {
        const content = `---
current_task: "task"
tier: "full"
phase: "review"
---
Body`;
        // Even though no review files exist, StatusFile says review
        const result = recoverPhase(content, []);
        expect(result.phase).toBe("review");
        expect(result.reconstructed).toBe(false);
    });
});
describe("generateResumeOutput package context", () => {
    it("includes current, completed, and next package in recovery answers", () => {
        const output = generateResumeOutput({
            plan: {
                objective: "Implement context-safe execution packages",
                tasks: ["T-01", "T-02", "T-03"],
            },
            progress: {
                completedTasks: ["T-01"],
                inProgressTasks: ["T-02"],
                blockers: [],
            },
            findings: { findings: [] },
            packages: {
                currentPackage: "P2",
                completedPackages: ["P1"],
                nextPackage: "P3",
                packageCount: 3,
            },
        });
        const answers = output.questions.map((q) => q.answer).join("\n");
        expect(answers).toContain("current_package=P2");
        expect(answers).toContain("completed_packages=P1");
        expect(answers).toContain("next_package=P3");
        expect(output.autoLocatePackage).toBe("P2");
    });
});
//# sourceMappingURL=resume-recovery.test.js.map