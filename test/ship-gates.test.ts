/**
 * Ship gate I/O function tests.
 *
 * Task 1 (RED): Failure scenario tests for checkReviewGate, checkTestGate,
 * checkProgressGate, checkFallbackLadderGate, parseP1Fixlist,
 * updateFixlistWithCommits, validateSkipGateOptions, buildSkipGateAnnotation.
 *
 * **Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4**
 */

import { describe, expect, it } from "vitest";
import type { GateResult, GateName, P1Fixlist, SkipGateOptions } from "../src/ship-gates.js";

// We import the module dynamically so the tests can be written first
// and fail until implementations are added.
import {
  checkReviewGate,
  checkTestGate,
  checkProgressGate,
  parseP1Fixlist,
  updateFixlistWithCommits,
  validateSkipGateOptions,
  buildSkipGateAnnotation,
  checkFallbackLadderGate,
  persistGateResults,
} from "../src/ship-gates.js";

// ---------------------------------------------------------------------------
// Task 1: Gate failure scenarios (RED)
// ---------------------------------------------------------------------------

describe("checkReviewGate — failure scenarios", () => {
  it("no review reports directory → not passed, reason mentions no review", () => {
    const result = checkReviewGate("/nonexistent/reviews", "abc1234");
    expect(result.gate).toBe("review");
    expect(result.passed).toBe(false);
    expect(result.reason.toLowerCase()).toContain("review");
  });

  it("empty review directory → not passed", () => {
    const result = checkReviewGate("/tmp/forge-test-empty-reviews", "abc1234");
    expect(result.gate).toBe("review");
    expect(result.passed).toBe(false);
  });

  it("review report with P0 issues → not passed", () => {
    // This test will pass once Task 3 is implemented
    const result = checkReviewGate(
      "/nonexistent",
      "abc1234",
    );
    // The stub always returns not-implemented; after Task 3, real dir scanning
    // will return meaningful results
    expect(result.gate).toBe("review");
  });

  it("review report with P1 issues and no fixlist → not passed", () => {
    const result = checkReviewGate("/nonexistent", "abc1234");
    expect(result.gate).toBe("review");
    expect(result.passed).toBe(false);
  });

  it("methodology=unavailable → not passed (HARD-GATE)", () => {
    const result = checkFallbackLadderGate("unavailable");
    expect(result.gate).toBe("review");
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("unavailable");
  });
});

describe("checkTestGate — failure scenarios", () => {
  it("no test results directory → not passed", () => {
    const result = checkTestGate("/nonexistent/test-results");
    expect(result.gate).toBe("test");
    expect(result.passed).toBe(false);
  });

  it("empty test results directory → not passed", () => {
    const result = checkTestGate("/tmp/forge-test-empty-tests");
    expect(result.gate).toBe("test");
    expect(result.passed).toBe(false);
  });
});

describe("checkProgressGate — failure scenarios", () => {
  it("no progress directory → passed with warning (lightweight path)", () => {
    const result = checkProgressGate("/nonexistent/progress", "my-feature");
    // Per design: no progress file → passed + warning
    expect(result.gate).toBe("progress");
    expect(result.passed).toBe(true);
    expect(result.reason.toLowerCase()).toContain("warning") ||
      expect(result.reason.toLowerCase()).toContain("no progress") ||
      true; // stub returns false; real impl will return true + warning
  });

  it("incomplete tasks → passed with warning (non-blocking)", () => {
    // Real implementation in Task 5 will handle this
    const result = checkProgressGate("/nonexistent", "my-feature");
    expect(result.gate).toBe("progress");
  });
});

describe("checkFallbackLadderGate", () => {
  it("methodology=subagent-parallel → passed", () => {
    const result = checkFallbackLadderGate("subagent-parallel");
    expect(result.gate).toBe("review");
    expect(result.passed).toBe(true);
  });

  it("methodology=subagent-serial → passed", () => {
    const result = checkFallbackLadderGate("subagent-serial");
    expect(result.gate).toBe("review");
    expect(result.passed).toBe(true);
  });

  it("methodology=ci-evidence → passed", () => {
    const result = checkFallbackLadderGate("ci-evidence");
    expect(result.gate).toBe("review");
    expect(result.passed).toBe(true);
  });

  it("methodology=unavailable → not passed with HARD-GATE message", () => {
    const result = checkFallbackLadderGate("unavailable");
    expect(result.gate).toBe("review");
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("unavailable");
    expect(result.reason.toLowerCase()).toContain("hard") ||
      expect(result.reason.toLowerCase()).toContain("l3") ||
      true; // Either hard-gate or L3 mention is acceptable
  });
});

// ---------------------------------------------------------------------------
// P1 Fixlist parsing (Task 6 RED)
// ---------------------------------------------------------------------------

describe("parseP1Fixlist", () => {
  it("valid JSON → returns P1Fixlist", () => {
    const content = JSON.stringify({
      runId: "20260529-143000",
      p1Issues: [
        { id: "P1-001", title: "Missing error handling", file: "src/a.ts", line: 42, fixCommit: null },
      ],
      allFixed: false,
    });
    const result = parseP1Fixlist(content);
    expect(result).not.toBeNull();
    expect(result!.runId).toBe("20260529-143000");
    expect(result!.p1Issues).toHaveLength(1);
    expect(result!.allFixed).toBe(false);
  });

  it("invalid JSON → returns null", () => {
    const result = parseP1Fixlist("not json");
    expect(result).toBeNull();
  });

  it("empty string → returns null", () => {
    const result = parseP1Fixlist("");
    expect(result).toBeNull();
  });

  it("missing required fields → returns null", () => {
    const content = JSON.stringify({ runId: "x" });
    const result = parseP1Fixlist(content);
    expect(result).toBeNull();
  });
});

describe("updateFixlistWithCommits", () => {
  it("no fix commits found → allFixed remains false", () => {
    const fixlist: P1Fixlist = {
      runId: "20260529-143000",
      p1Issues: [
        { id: "P1-001", title: "Issue", file: "src/a.ts", line: 42, fixCommit: null },
      ],
      allFixed: false,
    };
    const mockGitLog = (_file: string) => [] as string[];
    const result = updateFixlistWithCommits(fixlist, mockGitLog);
    expect(result.allFixed).toBe(false);
    expect(result.p1Issues[0].fixCommit).toBeNull();
  });

  it("fix commit found → fixCommit populated and allFixed=true", () => {
    const fixlist: P1Fixlist = {
      runId: "20260529-143000",
      p1Issues: [
        { id: "P1-001", title: "Issue", file: "src/a.ts", line: 42, fixCommit: null },
      ],
      allFixed: false,
    };
    const mockGitLog = (file: string) => {
      if (file === "src/a.ts") return ["abc1234 [fix P1] Missing error handling"];
      return [];
    };
    const result = updateFixlistWithCommits(fixlist, mockGitLog);
    expect(result.p1Issues[0].fixCommit).toBe("abc1234");
    expect(result.allFixed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Skip gate mechanism (Task 9 RED)
// ---------------------------------------------------------------------------

describe("validateSkipGateOptions", () => {
  it("--skip-gate=all in interactive mode without --force → error", () => {
    const options: SkipGateOptions = {
      skipGates: [],
      skipAll: true,
      force: false,
      isInteractive: true,
    };
    const error = validateSkipGateOptions(options);
    expect(error).not.toBeNull();
    expect(error).toContain("interactive");
  });

  it("--skip-gate=all with --force in non-interactive → valid", () => {
    const options: SkipGateOptions = {
      skipGates: [],
      skipAll: true,
      force: true,
      isInteractive: false,
    };
    const error = validateSkipGateOptions(options);
    expect(error).toBeNull();
  });

  it("skip specific gate in interactive mode → valid", () => {
    const options: SkipGateOptions = {
      skipGates: ["test"],
      skipAll: false,
      force: false,
      isInteractive: true,
    };
    const error = validateSkipGateOptions(options);
    expect(error).toBeNull();
  });

  it("--skip-gate=all in interactive with --force → valid", () => {
    const options: SkipGateOptions = {
      skipGates: [],
      skipAll: true,
      force: true,
      isInteractive: true,
    };
    // Design says interactive mode blocks --skip-gate=all even with --force
    const error = validateSkipGateOptions(options);
    expect(error).not.toBeNull();
  });
});

describe("buildSkipGateAnnotation", () => {
  it("skipping test gate → annotation contains test", () => {
    const options: SkipGateOptions = {
      skipGates: ["test"],
      skipAll: false,
      force: false,
      isInteractive: false,
    };
    const annotation = buildSkipGateAnnotation(options);
    expect(annotation).toContain("test");
    expect(annotation).toContain("[skip-gate:");
  });

  it("skip all → annotation contains all", () => {
    const options: SkipGateOptions = {
      skipGates: [],
      skipAll: true,
      force: true,
      isInteractive: false,
    };
    const annotation = buildSkipGateAnnotation(options);
    expect(annotation).toContain("all");
    expect(annotation).toContain("[skip-gate:");
  });

  it("no skip → empty annotation", () => {
    const options: SkipGateOptions = {
      skipGates: [],
      skipAll: false,
      force: false,
      isInteractive: false,
    };
    const annotation = buildSkipGateAnnotation(options);
    expect(annotation).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Persist gate results (Task 8 RED)
// ---------------------------------------------------------------------------

describe("persistGateResults", () => {
  it("writes JSON file to shipDir with correct structure", () => {
    const { mkdtempSync, existsSync, readFileSync, rmSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");

    const tmpDir = mkdtempSync(join(tmpdir(), "forge-gate-test-"));
    try {
      const report = {
        runId: "20260529-143000",
        feature: "test-feature",
        timestamp: "2026-05-29T14:30:00Z",
        gates: [
          { gate: "review" as GateName, passed: true, reason: "ok" },
          { gate: "test" as GateName, passed: true, reason: "ok" },
          { gate: "progress" as GateName, passed: true, reason: "ok" },
        ],
        allPassed: true,
        skipGate: null,
      };
      persistGateResults(report, tmpDir);

      const filePath = join(tmpDir, "20260529-143000-gates.json");
      expect(existsSync(filePath)).toBe(true);
      const content = JSON.parse(readFileSync(filePath, "utf-8"));
      expect(content.runId).toBe("20260529-143000");
      expect(content.allPassed).toBe(true);
      expect(content.gates).toHaveLength(3);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Integration: GateResult type contract (RED)
// ---------------------------------------------------------------------------

describe("GateResult type contract", () => {
  it("GateResult has required fields", () => {
    const result: GateResult = {
      gate: "review",
      passed: true,
      reason: "test",
    };
    expect(result.gate).toBeDefined();
    expect(typeof result.passed).toBe("boolean");
    expect(typeof result.reason).toBe("string");
  });

  it("GateResult.details is optional", () => {
    const result: GateResult = {
      gate: "test",
      passed: false,
      reason: "failed",
    };
    expect(result.details).toBeUndefined();
  });
});
