import { describe, expect, it } from "vitest";
import {
  buildSummary,
  CRITICAL_PATTERNS,
  matchPatterns,
  parseArgs,
} from "../scripts/scan-recent-ci-logs.mjs";

interface MatchedPattern {
  run_id: number;
  pattern: string;
  log_line: string;
}

interface RunInfo {
  databaseId: number;
  status: string;
  conclusion: string;
  headBranch: string;
  createdAt: string;
  event: string;
}

const SAMPLE_LOG = `
2026-05-26T10:00:00Z [INFO] Starting workflow execution
2026-05-26T10:00:01Z [ERROR] workflow load failed: file not found
2026-05-26T10:00:02Z [WARN] Retrying...
2026-05-26T10:00:03Z [ERROR] workflow_runtime_unavailable
2026-05-26T10:00:04Z [INFO] Falling back: L1 trigger activated
2026-05-26T10:00:05Z [WARN] stuck_timeout after 30s
2026-05-26T10:00:06Z [ERROR] backpressure_unrelieved in channel
some random log line
LineTooLargeError: line exceeded 100MB limit
`;

const CLEAN_LOG = `
2026-05-26T10:00:00Z [INFO] Starting workflow execution
2026-05-26T10:00:01Z [INFO] All systems nominal
2026-05-26T10:00:02Z [INFO] Completed successfully
`;

describe("scan-recent-ci-logs", () => {
  describe("parseArgs", () => {
    it("parses required --repo", () => {
      const result = parseArgs(["--repo", "owner/repo"]);
      expect(result.repo).toBe("owner/repo");
    });

    it("applies default --count of 100", () => {
      const result = parseArgs(["--repo", "owner/repo"]);
      expect(result.count).toBe(100);
    });

    it("parses --count", () => {
      const result = parseArgs(["--repo", "owner/repo", "--count", "50"]);
      expect(result.count).toBe(50);
    });

    it("parses --branch", () => {
      const result = parseArgs(["--repo", "owner/repo", "--branch", "main"]);
      expect(result.branch).toBe("main");
    });

    it("parses --write-health flag", () => {
      const result = parseArgs(["--repo", "owner/repo", "--write-health"]);
      expect(result.writeHealth).toBe(true);
    });

    it("defaults --write-health to false", () => {
      const result = parseArgs(["--repo", "owner/repo"]);
      expect(result.writeHealth).toBe(false);
    });

    it("throws on missing --repo", () => {
      expect(() => parseArgs([])).toThrow("--repo");
    });

    it("shows help with --help", () => {
      const result = parseArgs(["--help"]);
      expect(result.help).toBe(true);
    });
  });

  describe("matchPatterns", () => {
    it("matches all 6 critical patterns", () => {
      const matches = matchPatterns(123, SAMPLE_LOG) as MatchedPattern[];
      const matchedNames = matches.map((m) => m.pattern);
      expect(matchedNames).toContain("workflow load failed");
      expect(matchedNames).toContain("workflow_runtime_unavailable");
      expect(matchedNames).toContain("L1 trigger");
      expect(matchedNames).toContain("stuck_timeout");
      expect(matchedNames).toContain("backpressure_unrelieved");
      expect(matchedNames).toContain("LineTooLargeError");
    });

    it("returns empty array for clean logs", () => {
      const matches = matchPatterns(999, CLEAN_LOG);
      expect(matches).toHaveLength(0);
    });

    it("includes run_id in each match", () => {
      const matches = matchPatterns(42, SAMPLE_LOG) as MatchedPattern[];
      for (const m of matches) {
        expect(m.run_id).toBe(42);
      }
    });

    it("includes the matching log line", () => {
      const matches = matchPatterns(1, SAMPLE_LOG) as MatchedPattern[];
      const wfMatch = matches.find((m) => m.pattern === "workflow load failed");
      expect(wfMatch).toBeDefined();
      expect(wfMatch!.log_line).toContain("workflow load failed");
    });

    it("matches multiple occurrences of same pattern", () => {
      const log = ["workflow load failed at step 1", "workflow load failed at step 2"].join("\n");
      const matches = matchPatterns(1, log) as MatchedPattern[];
      const wfMatches = matches.filter((m) => m.pattern === "workflow load failed");
      expect(wfMatches).toHaveLength(2);
    });

    it("is case-sensitive for pattern matching", () => {
      const log = "WORKFLOW LOAD FAILED in caps";
      const matches = matchPatterns(1, log);
      expect(matches).toHaveLength(0);
    });

    it("matches partial line content", () => {
      const log = "Error: workflow_runtime_unavailable (retrying)";
      const matches = matchPatterns(1, log) as MatchedPattern[];
      expect(matches).toHaveLength(1);
      expect(matches[0].pattern).toBe("workflow_runtime_unavailable");
    });
  });

  describe("buildSummary", () => {
    it("produces correct structure for empty matches", () => {
      const runs: RunInfo[] = [
        {
          databaseId: 1,
          status: "completed",
          conclusion: "success",
          headBranch: "main",
          createdAt: "2026-05-26T10:00:00Z",
          event: "push",
        },
        {
          databaseId: 2,
          status: "completed",
          conclusion: "success",
          headBranch: "main",
          createdAt: "2026-05-26T10:01:00Z",
          event: "push",
        },
      ];
      const allMatches: MatchedPattern[] = [];

      const summary = buildSummary(runs, allMatches);

      expect(summary.scanned_runs).toBe(2);
      expect(summary.failed_runs).toBe(0);
      expect(summary.matched_patterns).toHaveLength(0);
      expect(summary.pattern_counts).toEqual({});
    });

    it("counts failed runs correctly", () => {
      const runs: RunInfo[] = [
        {
          databaseId: 1,
          status: "completed",
          conclusion: "success",
          headBranch: "main",
          createdAt: "2026-05-26T10:00:00Z",
          event: "push",
        },
        {
          databaseId: 2,
          status: "completed",
          conclusion: "failure",
          headBranch: "main",
          createdAt: "2026-05-26T10:01:00Z",
          event: "push",
        },
        {
          databaseId: 3,
          status: "completed",
          conclusion: "failure",
          headBranch: "dev",
          createdAt: "2026-05-26T10:02:00Z",
          event: "push",
        },
      ];
      const summary = buildSummary(runs, []);
      expect(summary.failed_runs).toBe(2);
    });

    it("aggregates pattern_counts from matches", () => {
      const matches: MatchedPattern[] = [
        { run_id: 1, pattern: "workflow load failed", log_line: "err1" },
        { run_id: 2, pattern: "workflow load failed", log_line: "err2" },
        { run_id: 3, pattern: "stuck_timeout", log_line: "timeout" },
      ];

      const summary = buildSummary([], matches);

      expect(summary.pattern_counts["workflow load failed"]).toBe(2);
      expect(summary.pattern_counts.stuck_timeout).toBe(1);
    });

    it("passes matched_patterns through", () => {
      const matches: MatchedPattern[] = [
        { run_id: 1, pattern: "L1 trigger", log_line: "falling back" },
      ];
      const summary = buildSummary([], matches);
      expect(summary.matched_patterns).toEqual(matches);
    });
  });

  describe("CRITICAL_PATTERNS", () => {
    it("contains exactly 6 patterns", () => {
      expect(CRITICAL_PATTERNS).toHaveLength(6);
    });

    it("includes all required patterns", () => {
      const expected = [
        "workflow load failed",
        "workflow_runtime_unavailable",
        "L1 trigger",
        "stuck_timeout",
        "backpressure_unrelieved",
        "LineTooLargeError",
      ];
      for (const p of expected) {
        expect(CRITICAL_PATTERNS).toContain(p);
      }
    });
  });
});
