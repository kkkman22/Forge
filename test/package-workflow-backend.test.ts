import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkFallbackLadderGate, evaluateFallbackLadder } from "../src/ship-gates.js";

const ROOT = resolve(import.meta.dirname, "..");

describe("package-aware saved workflow backend", () => {
  it("reports L0 saved workflow distinctly from subagent fallback", () => {
    const result = evaluateFallbackLadder({
      isInteractive: true,
      workflowsEnvSet: true,
      workflowsEnabled: true,
      workflowFileExists: true,
      workflowSyntaxValid: true,
      concurrencyBridgeAvailable: true,
      subagentAvailable: true,
    });

    expect(result).toEqual({ level: "L0", methodology: "saved-workflow" });
    expect(checkFallbackLadderGate(result.methodology).passed).toBe(true);
  });

  it("documents saved workflows as package-scoped optional L0 backends", () => {
    const ladder = readFileSync(
      resolve(ROOT, ".claude/rules/workflow-fallback-ladder.md"),
      "utf-8",
    );
    const review = readFileSync(resolve(ROOT, "skills/forge/lib/review/instructions.md"), "utf-8");
    const workflow = readFileSync(resolve(ROOT, ".claude/workflows/forge-review.js"), "utf-8");

    expect(ladder).toContain("saved-workflow");
    expect(ladder).toContain("phase/package-scoped");
    expect(review).toContain("saved-workflow");
    expect(review).toContain("package-scoped");
    expect(workflow).toContain("package-scoped");
    expect(workflow).not.toContain("multi-agent-review");
  });
});
