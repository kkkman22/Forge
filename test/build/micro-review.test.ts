import { describe, expect, it } from "vitest";
import {
  type MicroReviewInput,
  type MicroReviewResult,
  runMicroReview,
} from "../../src/build-micro-review.js";

describe("runMicroReview", () => {
  // ---------------------------------------------------------------------------
  // v1 plan — full coverage → pass
  // ---------------------------------------------------------------------------
  it("v1 plan with all criteria covered → pass", () => {
    const input: MicroReviewInput = {
      task: {
        title: "Add hello function",
        files: ["src/hello.ts"],
        acceptance_criteria: ["exports a hello() function", "hello() returns 'world'"],
        expected_output: "exit 0",
      },
      gitDiff:
        "diff --git a/src/hello.ts b/src/hello.ts\n" +
        "--- /dev/null\n" +
        "+++ b/src/hello.ts\n" +
        "@@ -0,0 +1,5 @@\n" +
        "+export function hello(): string {\n" +
        '+  return "world";\n' +
        "+}\n",
      verifyOutput: "Tests: 2 passed, 2 total",
      planVersion: "v1",
    };

    const result = runMicroReview(input);
    expect(result.verdict).toBe("pass");
    expect(result.covered.length).toBe(2);
    expect(result.missing).toEqual([]);
    expect(result.overBuilt).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // v1 plan — missing criteria → needs_iteration
  // ---------------------------------------------------------------------------
  it("v1 plan with missing criteria → needs_iteration", () => {
    const input: MicroReviewInput = {
      task: {
        title: "Add hello function",
        files: ["src/hello.ts"],
        acceptance_criteria: [
          "exports a hello() function",
          "hello() returns 'world'",
          "includes JSDoc comment",
        ],
        expected_output: "exit 0",
      },
      gitDiff:
        "diff --git a/src/hello.ts b/src/hello.ts\n" +
        "+++ b/src/hello.ts\n" +
        "@@ -0,0 +1,3 @@\n" +
        "+export function hello(): string {\n" +
        '+  return "world";\n' +
        "+}\n",
      verifyOutput: "Tests: 2 passed",
      planVersion: "v1",
    };

    const result = runMicroReview(input);
    expect(result.verdict).toBe("needs_iteration");
    expect(result.missing).toContain("includes JSDoc comment");
    expect(result.covered.length).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // v1 plan — overBuilt (file not in task.files) → needs_iteration
  // ---------------------------------------------------------------------------
  it("v1 plan with new file not in task.files → needs_iteration", () => {
    const input: MicroReviewInput = {
      task: {
        title: "Add hello function",
        files: ["src/hello.ts"],
        acceptance_criteria: ["exports a hello() function"],
        expected_output: "exit 0",
      },
      gitDiff:
        "diff --git a/src/hello.ts b/src/hello.ts\n" +
        "+++ b/src/hello.ts\n" +
        "@@ -0,0 +1,3 @@\n" +
        "+export function hello(): string {\n" +
        '+  return "world";\n' +
        "+}\n" +
        "diff --git a/src/extra.ts b/src/extra.ts\n" +
        "--- /dev/null\n" +
        "+++ b/src/extra.ts\n" +
        "@@ -0,0 +1,1 @@\n" +
        "+export const extra = true;\n",
      verifyOutput: "Tests: 1 passed",
      planVersion: "v1",
    };

    const result = runMicroReview(input);
    expect(result.verdict).toBe("needs_iteration");
    expect(result.overBuilt).toContain("src/extra.ts");
  });

  // ---------------------------------------------------------------------------
  // legacy plan — diff + PASS → pass
  // ---------------------------------------------------------------------------
  it("legacy plan with diff and PASS indicator → pass", () => {
    const input: MicroReviewInput = {
      task: {
        title: "Fix login bug",
      },
      gitDiff:
        "diff --git a/src/auth.ts b/src/auth.ts\n" +
        "+++ b/src/auth.ts\n" +
        "+  const fixed = true;\n",
      verifyOutput: "Tests: 3 passed, 3 total",
      planVersion: "legacy",
    };

    const result = runMicroReview(input);
    expect(result.verdict).toBe("pass");
  });

  // ---------------------------------------------------------------------------
  // legacy plan — no diff → needs_iteration
  // ---------------------------------------------------------------------------
  it("legacy plan with empty diff → needs_iteration", () => {
    const input: MicroReviewInput = {
      task: {
        title: "Fix login bug",
      },
      gitDiff: "",
      verifyOutput: "Tests: 3 passed",
      planVersion: "legacy",
    };

    const result = runMicroReview(input);
    expect(result.verdict).toBe("needs_iteration");
    expect(result.missing.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Empty acceptance_criteria → pass (nothing to check)
  // ---------------------------------------------------------------------------
  it("v1 plan with empty acceptance_criteria → pass", () => {
    const input: MicroReviewInput = {
      task: {
        title: "Refactor imports",
        files: ["src/index.ts"],
        acceptance_criteria: [],
        expected_output: "exit 0",
      },
      gitDiff:
        "diff --git a/src/index.ts b/src/index.ts\n" +
        "+++ b/src/index.ts\n" +
        '+import { something } from "./lib";\n',
      verifyOutput: "Tests: 5 passed",
      planVersion: "v1",
    };

    const result = runMicroReview(input);
    expect(result.verdict).toBe("pass");
    expect(result.covered).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.overBuilt).toEqual([]);
  });
});
