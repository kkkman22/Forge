/**
 * Tests for error passthrough and format compatibility.
 *
 * Covers:
 *   - Req 2.5: Explore error/empty result passthrough
 *   - Req 4.4: vitest output format compatibility
 *   - Req 4.5: Test output unparseable format passthrough
 */
import { describe, expect, it } from "vitest";
import type { ExploreSummary } from "../src/context-budget.js";
import {
  canParseTestOutput,
  deserializeTestOutput,
  serializeExploreResult,
  serializeExploreSummary,
} from "../src/context-budget.js";

// ---------------------------------------------------------------------------
// Req 2.5: Explore error/empty passthrough
// ---------------------------------------------------------------------------

describe("Feature: context-budget-management, Req 2.5: Explore error/empty passthrough", () => {
  it("passes through null input", () => {
    expect(serializeExploreResult(null)).toBe("Explore Agent 返回空结果");
  });

  it("passes through undefined input", () => {
    expect(serializeExploreResult(undefined)).toBe("Explore Agent 返回空结果");
  });

  it("passes through error string unchanged", () => {
    const error = "Error: Cannot find module 'xyz'";
    expect(serializeExploreResult(error)).toBe(error);
  });

  it("passes through empty ExploreSummary", () => {
    const empty: ExploreSummary = {
      entryPoints: [],
      dependencyChain: [],
      relatedTests: [],
      keyInterfaces: [],
      fileGroups: [],
    };
    expect(serializeExploreResult(empty)).toBe("Explore Agent 返回空结果");
  });

  it("serializes non-empty ExploreSummary normally", () => {
    const summary: ExploreSummary = {
      entryPoints: [{ filePath: "src/a.ts", line: 1, functionName: "main" }],
      dependencyChain: [],
      relatedTests: [],
      keyInterfaces: [],
      fileGroups: [],
    };
    const result = serializeExploreResult(summary);
    expect(result).toContain("src/a.ts");
    expect(result).not.toBe("Explore Agent 返回空结果");
  });

  it("serializeExploreSummary still works for direct calls", () => {
    const summary: ExploreSummary = {
      entryPoints: [{ filePath: "src/b.ts", line: 5, functionName: "test" }],
      dependencyChain: [],
      relatedTests: [],
      keyInterfaces: [],
      fileGroups: [],
    };
    expect(serializeExploreSummary(summary)).toContain("src/b.ts");
  });
});

// ---------------------------------------------------------------------------
// Req 4.4: vitest output format compatibility
// ---------------------------------------------------------------------------

describe("Feature: context-budget-management, Req 4.4: vitest format compatibility", () => {
  it("parses vitest all-pass output format", () => {
    const vitestOutput = "✓ 42/42 tests passed (0 failed, 0 skipped) in 1.2s";
    expect(canParseTestOutput(vitestOutput)).toBe(true);
    const result = deserializeTestOutput(vitestOutput);
    expect(result.total).toBe(42);
    expect(result.passed).toBe(42);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.duration).toBe(1200);
    expect(result.parseFailed).toBeUndefined();
  });

  it("parses vitest all-pass with skipped tests", () => {
    const vitestOutput = "✓ 38/42 tests passed (0 failed, 4 skipped) in 2.5s";
    expect(canParseTestOutput(vitestOutput)).toBe(true);
    const result = deserializeTestOutput(vitestOutput);
    expect(result.total).toBe(42);
    expect(result.passed).toBe(38);
    expect(result.skipped).toBe(4);
    expect(result.duration).toBe(2500);
  });

  it("parses vitest failure output format", () => {
    const vitestOutput = [
      "✗ 3 failed, 39 passed, 0 skipped in 4.7s",
      "  FAIL test/suite.test.ts (src/module.ts:15)",
      "    AssertionError: expected 5 to be 10",
    ].join("\n");
    expect(canParseTestOutput(vitestOutput)).toBe(true);
    const result = deserializeTestOutput(vitestOutput);
    expect(result.failed).toBe(3);
    expect(result.passed).toBe(39);
    expect(result.total).toBe(42);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].testName).toBe("test/suite.test.ts");
    expect(result.failures[0].filePath).toBe("src/module.ts");
    expect(result.failures[0].line).toBe(15);
    expect(result.failures[0].errorMessage).toBe("AssertionError: expected 5 to be 10");
  });

  it("parses vitest multiple failure output", () => {
    const vitestOutput = [
      "✗ 2 failed, 10 passed, 0 skipped in 3.1s",
      "  FAIL first test (a.ts:1)",
      "    error one",
      "  FAIL second test (b.ts:2)",
      "    error two",
    ].join("\n");
    const result = deserializeTestOutput(vitestOutput);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0].testName).toBe("first test");
    expect(result.failures[1].testName).toBe("second test");
  });
});

// ---------------------------------------------------------------------------
// Req 4.5: Test output unparseable format passthrough
// ---------------------------------------------------------------------------

describe("Feature: context-budget-management, Req 4.5: Unparseable format passthrough", () => {
  it("detects unparseable format", () => {
    const random = "Some random output that is not a test result";
    expect(canParseTestOutput(random)).toBe(false);
  });

  it("returns parseFailed=true for unrecognized format", () => {
    const random = "Some random output that is not a test result";
    const result = deserializeTestOutput(random);
    expect(result.parseFailed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("detects empty string as unparseable", () => {
    expect(canParseTestOutput("")).toBe(false);
    const result = deserializeTestOutput("");
    expect(result.parseFailed).toBe(true);
  });

  it("detects vitest verbose output as unparseable (no summary line)", () => {
    const verbose = ["✓ src/a.test.ts (2 tests) 5ms", "✓ src/b.test.ts (3 tests) 10ms"].join("\n");
    expect(canParseTestOutput(verbose)).toBe(false);
  });

  it("does not set parseFailed for valid all-pass format", () => {
    const valid = "✓ 10/10 tests passed (0 failed, 0 skipped) in 1.0s";
    const result = deserializeTestOutput(valid);
    expect(result.parseFailed).toBeUndefined();
  });

  it("does not set parseFailed for valid failure format", () => {
    const valid = "✗ 1 failed, 9 passed, 0 skipped in 1.0s";
    const result = deserializeTestOutput(valid);
    expect(result.parseFailed).toBeUndefined();
  });
});
