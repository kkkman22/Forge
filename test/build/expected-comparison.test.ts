import { describe, expect, it } from "vitest";
import { compareExpectedOutput, type ExpectedSpec } from "../../src/build.js";

describe("compareExpectedOutput", () => {
  it("matches exit 0 expectation", () => {
    const spec: ExpectedSpec = {
      expected: "exit 0",
      actual: { exitCode: 0, output: "all passed" },
    };
    const result = compareExpectedOutput(spec);
    expect(result.match).toBe(true);
  });

  it("fails exit 1 expectation with exit 0 actual", () => {
    const spec: ExpectedSpec = { expected: "exit 1", actual: { exitCode: 0, output: "passed" } };
    const result = compareExpectedOutput(spec);
    expect(result.match).toBe(false);
  });

  it("matches substring expectation", () => {
    const spec: ExpectedSpec = {
      expected: 'output contains "passed"',
      actual: { exitCode: 0, output: "Tests: 5 passed" },
    };
    const result = compareExpectedOutput(spec);
    expect(result.match).toBe(true);
  });

  it("fails substring expectation when not found", () => {
    const spec: ExpectedSpec = {
      expected: 'output contains "passed"',
      actual: { exitCode: 1, output: "Error: module not found" },
    };
    const result = compareExpectedOutput(spec);
    expect(result.match).toBe(false);
  });

  it("matches FAIL reason expectation", () => {
    const spec: ExpectedSpec = {
      expected: 'FAIL -- "function not defined"',
      actual: { exitCode: 1, output: "ReferenceError: function not defined" },
    };
    const result = compareExpectedOutput(spec);
    expect(result.match).toBe(true);
  });

  it("fails when reason not in output", () => {
    const spec: ExpectedSpec = {
      expected: 'FAIL -- "assertion failed"',
      actual: { exitCode: 1, output: "SyntaxError: unexpected token" },
    };
    const result = compareExpectedOutput(spec);
    expect(result.match).toBe(false);
  });
});
