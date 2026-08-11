import { describe, expect, it } from "vitest";
import type { ReviewSubagentContext } from "../src/review.js";
import { buildReviewSubagents } from "../src/review.js";

describe("buildReviewSubagents Layer 4", () => {
  const baseContext: ReviewSubagentContext = {
    hasSpec: true,
    specPath: ".tinkerman/specs/test/spec.md",
    changedFiles: ["src/App.vue"],
  };

  it("includes frontend-check when Vue files present", () => {
    const invocations = buildReviewSubagents({
      ...baseContext,
      changedFiles: ["src/App.vue", "src/utils.ts"],
    });
    const types = invocations.map((i) => i.agentType);
    expect(types).toContain("frontend-check");
  });

  it("excludes frontend-check when no Vue files", () => {
    const invocations = buildReviewSubagents({
      ...baseContext,
      changedFiles: ["src/utils.ts", "src/api.ts"],
    });
    const types = invocations.map((i) => i.agentType);
    expect(types).not.toContain("frontend-check");
  });

  it("maintains base layers when no spec and no Vue", () => {
    const invocations = buildReviewSubagents({
      ...baseContext,
      hasSpec: false,
      changedFiles: ["src/utils.ts"],
    });
    const types = invocations.map((i) => i.agentType);
    expect(types).toEqual(["quality-check", "security-check"]);
  });

  it("includes all layers with spec + Vue", () => {
    const invocations = buildReviewSubagents({
      ...baseContext,
      changedFiles: ["src/App.vue"],
    });
    const types = invocations.map((i) => i.agentType);
    expect(types).toContain("spec-check");
    expect(types).toContain("quality-check");
    expect(types).toContain("security-check");
    expect(types).toContain("frontend-check");
  });
});
