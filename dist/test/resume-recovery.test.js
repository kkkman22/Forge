/**
 * Resume recovery tests — recoverPhase integration.
 */
import { describe, expect, it } from "vitest";
import { recoverPhase } from "../src/resume.js";
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
//# sourceMappingURL=resume-recovery.test.js.map