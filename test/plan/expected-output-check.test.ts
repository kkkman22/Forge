import { describe, it, expect } from "vitest";
import { checkExpectedOutput } from "../../src/plan.js";

describe("checkExpectedOutput", () => {
  it("reports error for Run step missing Expected in new plan", () => {
    const planContent = [
      "### Task 1: test",
      "Run: `npm test`",
      "Expected: exit 0",
      "### Task 2: test2",
      "Run: `npm test other`",
    ].join("\n");
    const result = checkExpectedOutput(planContent, false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("Task 2");
  });

  it("passes for plan where all Run steps have Expected", () => {
    const planContent = [
      "### Task 1: test",
      "Run: `npm test`",
      "Expected: exit 0",
      "### Task 2: test2",
      "Run: `npm test other`",
      "Expected: FAIL -- \"module not found\"",
    ].join("\n");
    const result = checkExpectedOutput(planContent, false);
    expect(result.errors).toEqual([]);
  });

  it("recognizes all three Expected forms", () => {
    const planContent = [
      "### Task 1: a",
      "Run: cmd1",
      "Expected: exit 0",
      "Run: cmd2",
      "Expected: output contains \"passed\"",
      "Run: cmd3",
      "Expected: FAIL -- \"reason\"",
    ].join("\n");
    const result = checkExpectedOutput(planContent, false);
    expect(result.errors).toEqual([]);
  });

  it("reports warning for legacy plan missing Expected", () => {
    const planContent = [
      "### Task 1: old",
      "Run: `npm test`",
    ].join("\n");
    const result = checkExpectedOutput(planContent, true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("legacy");
  });
});
