import { describe, expect, it } from "vitest";
import { buildReviewSubagents } from "../src/review";

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
    expect(spec!.prompt).toContain(".forge/reviews/.diff-context.md");
  });

  it("quality-check prompt contains diff-context path", () => {
    const quality = invocations.find((i) => i.agentType === "quality-check");
    expect(quality).toBeDefined();
    expect(quality!.prompt).toContain(".forge/reviews/.diff-context.md");
  });

  it("security-check prompt contains diff-context path", () => {
    const security = invocations.find((i) => i.agentType === "security-check");
    expect(security).toBeDefined();
    expect(security!.prompt).toContain(".forge/reviews/.diff-context.md");
  });

  it("spec/quality/security prompts contain Turn Budget Discipline", () => {
    const types = ["spec-check", "quality-check", "security-check"];
    for (const t of types) {
      const inv = invocations.find((i) => i.agentType === t);
      expect(inv).toBeDefined();
      expect(inv!.prompt).toContain("diff-context");
      expect(inv!.prompt).toContain("FINDINGS");
    }
  });

  it("spec/quality/security prompts contain hard constraints", () => {
    const types = ["spec-check", "quality-check", "security-check"];
    for (const t of types) {
      const inv = invocations.find((i) => i.agentType === t);
      expect(inv).toBeDefined();
      expect(inv!.prompt).toContain("final turn");
      expect(inv!.prompt).toContain("tool_use");
      expect(inv!.prompt).toContain("Insufficient evidence");
    }
  });

  it("frontend-check prompt does NOT contain diff-context path", () => {
    const frontend = invocations.find((i) => i.agentType === "frontend-check");
    expect(frontend).toBeDefined();
    expect(frontend!.prompt).not.toContain(".forge/reviews/.diff-context.md");
  });

  it("frontend-check prompt keeps .vue file names", () => {
    const frontend = invocations.find((i) => i.agentType === "frontend-check");
    expect(frontend).toBeDefined();
    expect(frontend!.prompt).toContain("components/App.vue");
  });
});
