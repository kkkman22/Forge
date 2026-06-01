import { describe, expect, it } from "vitest";
import { mergeReviewResults } from "../src/review.js";
import type { SubagentResult } from "../src/types.js";

describe("review background fan-in", () => {
  it("merges results from successful agents when one fails", () => {
    const results: SubagentResult[] = [
      {
        agentType: "quality-check",
        status: "success",
        output: JSON.stringify([
          {
            severity: "P2",
            confidence: 0.8,
            fixRoute: "auto",
            filePath: "src/a.ts",
            lineNumber: 10,
            description: "issue A",
            suggestion: "fix A",
            reviewer: "quality-check",
          },
        ]),
      },
      {
        agentType: "security-check",
        status: "failure",
        error: "agent crashed",
      },
      {
        agentType: "frontend-check",
        status: "success",
        output: JSON.stringify([
          {
            severity: "P3",
            confidence: 0.8,
            fixRoute: "auto",
            filePath: "src/b.vue",
            lineNumber: 20,
            description: "issue B",
            suggestion: "fix B",
            reviewer: "frontend-check",
          },
        ]),
      },
    ];

    const merged = mergeReviewResults(results);
    expect(merged.length).toBe(2);
    expect(merged.map((f) => f.reviewer)).toContain("quality-check");
    expect(merged.map((f) => f.reviewer)).toContain("frontend-check");
  });

  it("returns empty when all agents fail", () => {
    const results: SubagentResult[] = [
      { agentType: "quality-check", status: "failure", error: "timeout" },
      { agentType: "security-check", status: "failure", error: "crash" },
    ];

    const merged = mergeReviewResults(results);
    expect(merged).toHaveLength(0);
  });
});
