import { describe, expect, it } from "vitest";
import { buildReviewSubagents, WORKTREE_EDIT_PREFLIGHT } from "../src/review";
describe("buildReviewSubagents prompt diff-context", () => {
    const ctx = {
        hasSpec: true,
        specPath: ".kiro/specs/example/spec.md",
        changedFiles: ["src/review.ts", "src/utils.ts", "components/App.vue"],
    };
    const invocations = buildReviewSubagents(ctx);
    it("spec-check prompt contains diff-context path", () => {
        const spec = invocations.find((i) => i.agentType === "spec-check");
        expect(spec).toBeDefined();
        expect(spec.prompt).toContain(".forge/reviews/.diff-context.md");
    });
    it("quality-check prompt contains diff-context path", () => {
        const quality = invocations.find((i) => i.agentType === "quality-check");
        expect(quality).toBeDefined();
        expect(quality.prompt).toContain(".forge/reviews/.diff-context.md");
    });
    it("security-check prompt contains diff-context path", () => {
        const security = invocations.find((i) => i.agentType === "security-check");
        expect(security).toBeDefined();
        expect(security.prompt).toContain(".forge/reviews/.diff-context.md");
    });
    it("spec/quality/security prompts contain Turn Budget Discipline", () => {
        const types = ["spec-check", "quality-check", "security-check"];
        for (const t of types) {
            const inv = invocations.find((i) => i.agentType === t);
            expect(inv).toBeDefined();
            expect(inv.prompt).toContain("diff-context");
            expect(inv.prompt).toContain("FINDINGS");
        }
    });
    it("spec/quality/security prompts contain hard constraints", () => {
        const types = ["spec-check", "quality-check", "security-check"];
        for (const t of types) {
            const inv = invocations.find((i) => i.agentType === t);
            expect(inv).toBeDefined();
            expect(inv.prompt).toContain("final turn");
            expect(inv.prompt).toContain("tool_use");
            expect(inv.prompt).toContain("Insufficient evidence");
        }
    });
    it("frontend-check prompt does NOT contain diff-context path", () => {
        const frontend = invocations.find((i) => i.agentType === "frontend-check");
        expect(frontend).toBeDefined();
        expect(frontend.prompt).not.toContain(".forge/reviews/.diff-context.md");
    });
    it("frontend-check prompt keeps .vue file names", () => {
        const frontend = invocations.find((i) => i.agentType === "frontend-check");
        expect(frontend).toBeDefined();
        expect(frontend.prompt).toContain("components/App.vue");
    });
    it("read-only review prompts do not inject editable worktree preflight", () => {
        for (const inv of invocations) {
            expect(inv.prompt).not.toContain(WORKTREE_EDIT_PREFLIGHT);
        }
    });
});
describe("buildReviewSubagents maxTurns per agent type", () => {
    const ctx = {
        hasSpec: true,
        specPath: ".kiro/specs/example/spec.md",
        changedFiles: ["src/x.ts"],
    };
    const invocations = buildReviewSubagents(ctx);
    it("spec-check gets maxTurns=15 (reads spec + plans + tasks)", () => {
        const spec = invocations.find((i) => i.agentType === "spec-check");
        expect(spec).toBeDefined();
        expect(spec.maxTurns).toBe(15);
    });
    it("quality-check gets maxTurns=12 (scans multiple files)", () => {
        const quality = invocations.find((i) => i.agentType === "quality-check");
        expect(quality).toBeDefined();
        expect(quality.maxTurns).toBe(12);
    });
    it("security-check gets maxTurns=10 (pattern matching, fewer reads)", () => {
        const security = invocations.find((i) => i.agentType === "security-check");
        expect(security).toBeDefined();
        expect(security.maxTurns).toBe(10);
    });
    it("frontend-check gets maxTurns=10 (default)", () => {
        const vueCtx = { hasSpec: false, changedFiles: ["src/App.vue"] };
        const vueInvocations = buildReviewSubagents(vueCtx);
        const frontend = vueInvocations.find((i) => i.agentType === "frontend-check");
        expect(frontend).toBeDefined();
        expect(frontend.maxTurns).toBe(10);
    });
});
describe("buildReviewSubagents prompt — final-report contract", () => {
    const ctx = {
        hasSpec: true,
        specPath: ".kiro/specs/example/spec.md",
        changedFiles: ["src/x.ts"],
    };
    const invocations = buildReviewSubagents(ctx);
    it("each review prompt teaches the sentinel marker", () => {
        for (const t of ["spec-check", "quality-check", "security-check"]) {
            const inv = invocations.find((i) => i.agentType === t);
            expect(inv).toBeDefined();
            // Prompt mentions the literal sentinel and the heading shape so the
            // model knows what closes a valid run.
            expect(inv.prompt).toContain("<!-- review-final -->");
            expect(inv.prompt).toMatch(/Layer\s*N/);
            expect(inv.prompt).toMatch(/Severity/);
        }
    });
    it("each review prompt warns that a preamble-only ending is rejected", () => {
        for (const t of ["spec-check", "quality-check", "security-check"]) {
            const inv = invocations.find((i) => i.agentType === t);
            expect(inv).toBeDefined();
            expect(inv.prompt).toMatch(/preamble|Now let me check|incomplete/i);
        }
    });
});
describe("buildReviewSubagents context-file injection (spec context-injection-activation)", () => {
    it("injects contextFiles into quality-check prompt when provided", () => {
        const ctx = {
            hasSpec: false,
            changedFiles: ["src/x.ts"],
            contextFiles: [".forge/specs/auth/requirements.md", ".forge/specs/auth/design.md"],
        };
        const invocations = buildReviewSubagents(ctx);
        const quality = invocations.find((i) => i.agentType === "quality-check");
        expect(quality).toBeDefined();
        expect(quality.prompt).toContain("requirements.md");
        expect(quality.prompt).toContain("design.md");
    });
    it("injects contextFiles into security-check prompt when provided", () => {
        const ctx = {
            hasSpec: false,
            changedFiles: ["src/x.ts"],
            contextFiles: [".forge/specs/auth/threat-model.md"],
        };
        const invocations = buildReviewSubagents(ctx);
        const security = invocations.find((i) => i.agentType === "security-check");
        expect(security).toBeDefined();
        expect(security.prompt).toContain("threat-model.md");
    });
    it("injects contextFiles into spec-check prompt alongside spec path", () => {
        const ctx = {
            hasSpec: true,
            specPath: ".kiro/specs/example/spec.md",
            changedFiles: ["src/x.ts"],
            contextFiles: [".forge/specs/auth/conventions.md"],
        };
        const invocations = buildReviewSubagents(ctx);
        const spec = invocations.find((i) => i.agentType === "spec-check");
        expect(spec).toBeDefined();
        expect(spec.prompt).toContain("conventions.md");
    });
    it("does not inject a context section when contextFiles is absent", () => {
        const ctx = { hasSpec: false, changedFiles: ["src/x.ts"] };
        const invocations = buildReviewSubagents(ctx);
        const quality = invocations.find((i) => i.agentType === "quality-check");
        expect(quality).toBeDefined();
        expect(quality.prompt).not.toMatch(/Relevant artifacts|contextFiles/i);
    });
    it("does not inject a context section when contextFiles is empty", () => {
        const ctx = { hasSpec: false, changedFiles: ["src/x.ts"], contextFiles: [] };
        const invocations = buildReviewSubagents(ctx);
        const quality = invocations.find((i) => i.agentType === "quality-check");
        expect(quality).toBeDefined();
        expect(quality.prompt).not.toMatch(/Relevant artifacts|contextFiles/i);
    });
    it("frontend-check prompt is unaffected by contextFiles", () => {
        const ctx = {
            hasSpec: false,
            changedFiles: ["src/App.vue"],
            contextFiles: [".forge/specs/ui/conventions.md"],
        };
        const invocations = buildReviewSubagents(ctx);
        const frontend = invocations.find((i) => i.agentType === "frontend-check");
        expect(frontend).toBeDefined();
        // frontend-check keeps its dedicated prompt; context injection is for
        // spec/quality/security agents that consume the diff-context preamble.
        expect(frontend.prompt).toContain("App.vue");
    });
});
//# sourceMappingURL=review-subagent-prompt.test.js.map