import { describe, expect, it } from "vitest";
import { buildDecideRound1Subagents } from "../src/decide.js";
describe("buildDecideRound1Subagents context-file injection (spec context-injection-activation)", () => {
    const baseCtx = {
        taskDescription: "Add JWT login",
        involvedFiles: ["src/auth.ts"],
    };
    it("injects contextFiles into Round 1 prompts when provided", () => {
        const ctx = {
            ...baseCtx,
            contextFiles: [".forge/specs/auth/requirements.md", ".forge/specs/auth/design.md"],
        };
        const invocations = buildDecideRound1Subagents(ctx);
        expect(invocations.length).toBeGreaterThan(0);
        for (const inv of invocations) {
            expect(inv.prompt).toContain("requirements.md");
            expect(inv.prompt).toContain("design.md");
        }
    });
    it("uses a 'Relevant artifacts' label for the context section", () => {
        const ctx = {
            ...baseCtx,
            contextFiles: [".forge/specs/auth/research.md"],
        };
        const invocations = buildDecideRound1Subagents(ctx);
        expect(invocations[0].prompt).toMatch(/Relevant artifacts/i);
    });
    it("does not inject context section when contextFiles is absent", () => {
        const invocations = buildDecideRound1Subagents(baseCtx);
        expect(invocations[0].prompt).not.toMatch(/Relevant artifacts|contextFiles/i);
    });
    it("does not inject context section when contextFiles is empty", () => {
        const ctx = { ...baseCtx, contextFiles: [] };
        const invocations = buildDecideRound1Subagents(ctx);
        expect(invocations[0].prompt).not.toMatch(/Relevant artifacts|contextFiles/i);
    });
    it("preserves the task description and involved files alongside context", () => {
        const ctx = {
            ...baseCtx,
            contextFiles: [".forge/specs/auth/research.md"],
        };
        const invocations = buildDecideRound1Subagents(ctx);
        expect(invocations[0].prompt).toContain("Add JWT login");
        expect(invocations[0].prompt).toContain("src/auth.ts");
    });
});
//# sourceMappingURL=decide-context-injection.test.js.map