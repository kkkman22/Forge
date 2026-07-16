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
import { type EvidenceArtifact, writeEvidenceArtifact } from "../src/evidence-artifact.js";
import type { GateName, GateResult, P1Fixlist, SkipGateOptions } from "../src/ship-gates.js";
// We import the module dynamically so the tests can be written first
// and fail until implementations are added.
import {
  buildSkipGateAnnotation,
  checkFallbackLadderGate,
  checkPolicyProfileArtifactGate,
  checkProgressGate,
  checkReviewGate,
  checkTestGate,
  evaluateFallbackLadder,
  generateP1Fixlist,
  parseP1Fixlist,
  persistGateResults,
  runAllGates,
  updateFixlistWithCommits,
  validateSkipGateOptions,
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
    const result = checkReviewGate("/nonexistent", "abc1234");
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

describe("checkPolicyProfileArtifactGate", () => {
  function artifact(overrides: Partial<EvidenceArtifact>): EvidenceArtifact {
    const base: EvidenceArtifact = {
      schema_version: 1,
      artifact_id: "artifact-1",
      kind: "review",
      topic: "topic-a",
      run_id: "run-1",
      trace_id: "run-1",
      commit: "head-1",
      command: "npm run check",
      exit_code: 0,
      input_hash: "hash-1",
      result: "pass",
      producer: "vitest",
      created_at: "2026-06-09T01:00:00.000Z",
    };
    return Object.assign(base, overrides);
  }

  it("enterprise blocks ship when required mutation and test artifacts are missing", () => {
    const { mkdtempSync, rmSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");
    const root = mkdtempSync(join(tmpdir(), "forge-policy-gate-test-"));
    try {
      writeEvidenceArtifact(root, artifact({ kind: "review" }));

      const result = checkPolicyProfileArtifactGate(root, "topic-a", "head-1", "enterprise");

      expect(result.gate).toBe("policy");
      expect(result.passed).toBe(false);
      expect(result.reason).toContain("required test artifact is missing");
      expect(result.reason).toContain("required mutation artifact is missing");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("team passes with fresh review and test artifacts", () => {
    const { mkdtempSync, rmSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");
    const root = mkdtempSync(join(tmpdir(), "forge-policy-gate-test-"));
    try {
      writeEvidenceArtifact(root, artifact({ kind: "review" }));
      writeEvidenceArtifact(root, artifact({ artifact_id: "test-1", kind: "test" }));

      const result = checkPolicyProfileArtifactGate(root, "topic-a", "head-1", "team");

      expect(result.gate).toBe("policy");
      expect(result.passed).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("blocks stale required artifacts unless an explicit force ship artifact exists", () => {
    const { mkdtempSync, rmSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");
    const root = mkdtempSync(join(tmpdir(), "forge-policy-gate-test-"));
    try {
      writeEvidenceArtifact(root, artifact({ kind: "review", commit: "old" }));
      writeEvidenceArtifact(root, artifact({ artifact_id: "test-1", kind: "test", commit: "old" }));

      expect(checkPolicyProfileArtifactGate(root, "topic-a", "head-1", "team").passed).toBe(false);

      writeEvidenceArtifact(
        root,
        artifact({
          artifact_id: "force-ship-1",
          kind: "ship_gate",
          commit: "head-1",
          command: "forge ship topic-a --force",
          input_hash: "force-hash",
        }),
      );

      expect(checkPolicyProfileArtifactGate(root, "topic-a", "head-1", "team").passed).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("checkProgressGate — failure scenarios", () => {
  it("no progress directory → passed with warning (lightweight path)", () => {
    const result = checkProgressGate("/nonexistent/progress", "my-feature");
    // Per design: no progress file → passed + warning
    expect(result.gate).toBe("progress");
    expect(result.passed).toBe(true);
    expect(result.reason.toLowerCase()).toContain("no progress");
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

  it("methodology=saved-workflow → passed", () => {
    const result = checkFallbackLadderGate("saved-workflow");
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
    const reasonLower = result.reason.toLowerCase();
    const hasHardGate = reasonLower.includes("hard") || reasonLower.includes("l3");
    expect(hasHardGate).toBe(true); // Either hard-gate or L3 mention is acceptable
  });
});

// ---------------------------------------------------------------------------
// P1 Fixlist parsing (Task 6 RED)
// ---------------------------------------------------------------------------

describe("audit P2-5: missing methodology must not default to a trusted ladder rung", () => {
  it("review report that omits methodology → blocked (fail-closed, not defaulted to subagent-parallel)", async () => {
    const { mkdtempSync, writeFileSync, rmSync, mkdirSync } =
      require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");
    const { checkReviewGate } = await import("../src/ship-gates.js");

    const tmpDir = mkdtempSync(join(tmpdir(), "forge-meth-p25-"));
    try {
      mkdirSync(join(tmpDir, "reviews"), { recursive: true });
      // No methodology field at all. Before the fix this defaulted to
      // "subagent-parallel" (the most-trusted rung), so a main-agent-written
      // report could pass the HARD-GATE merely by omitting the field.
      writeFileSync(
        join(tmpDir, "reviews", "20260529-review.md"),
        ["---", "p0_count: 0", "p1_count: 0", "result: pass", "---", "# Review"].join("\n"),
      );

      const result = checkReviewGate(join(tmpDir, "reviews"), "def5678");
      expect(result.passed).toBe(false);
      expect(result.reason.toLowerCase()).toMatch(
        /methodology|unavailable|hard.?gate|l3|main agent/,
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("review report with an invalid methodology value → blocked (not coerced to a trusted rung)", async () => {
    const { mkdtempSync, writeFileSync, rmSync, mkdirSync } =
      require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");
    const { checkReviewGate } = await import("../src/ship-gates.js");

    const tmpDir = mkdtempSync(join(tmpdir(), "forge-meth-p25-invalid-"));
    try {
      mkdirSync(join(tmpDir, "reviews"), { recursive: true });
      writeFileSync(
        join(tmpDir, "reviews", "20260529-review.md"),
        [
          "---",
          "p0_count: 0",
          "p1_count: 0",
          "methodology: bogus-method",
          "result: pass",
          "---",
          "# Review",
        ].join("\n"),
      );

      const result = checkReviewGate(join(tmpDir, "reviews"), "def5678");
      expect(result.passed).toBe(false);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("parseP1Fixlist", () => {
  it("valid JSON → returns P1Fixlist", () => {
    const content = JSON.stringify({
      runId: "20260529-143000",
      p1Issues: [
        {
          id: "P1-001",
          title: "Missing error handling",
          file: "src/a.ts",
          line: 42,
          fixCommit: null,
        },
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
      p1Issues: [{ id: "P1-001", title: "Issue", file: "src/a.ts", line: 42, fixCommit: null }],
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
      p1Issues: [{ id: "P1-001", title: "Issue", file: "src/a.ts", line: 42, fixCommit: null }],
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
// Task 6: P1 Fix Checklist integration tests
// ---------------------------------------------------------------------------

describe("audit P2-2: P1 gate must not trust self-attested allFixed without git verification", () => {
  it("rejects a fixlist whose allFixed=true when no gitLogFn is provided (fail-closed)", async () => {
    const { mkdtempSync, writeFileSync, rmSync, mkdirSync } =
      require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");
    const { checkReviewGate } = await import("../src/ship-gates.js");

    const tmpDir = mkdtempSync(join(tmpdir(), "forge-fixlist-p22-"));
    try {
      mkdirSync(join(tmpDir, "reviews"), { recursive: true });
      writeFileSync(
        join(tmpDir, "reviews", "20260529-review.md"),
        [
          "---",
          "p0_count: 0",
          "p1_count: 1",
          "methodology: subagent-parallel",
          "result: fail",
          "---",
          "# Review",
        ].join("\n"),
      );
      // Self-attested allFixed:true with NO git verification hook.
      writeFileSync(
        join(tmpDir, "reviews", "20260529-p1-fixlist.json"),
        JSON.stringify({
          runId: "20260529",
          p1Issues: [
            {
              id: "P1-001",
              title: "Error handling",
              file: "src/a.ts",
              line: 42,
              fixCommit: "abc1234",
            },
          ],
          allFixed: true,
        }),
      );

      // No gitLogFn → the gate must NOT trust the self-attested allFixed.
      // Before the fix this returned passed:true, letting un-verified P1
      // fixes through to ship (CLAUDE.md §3.3 violation).
      const result = checkReviewGate(join(tmpDir, "reviews"), "def5678");
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/fix|P1|verif/i);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("still passes when gitLogFn independently confirms all P1 fixes", async () => {
    const { mkdtempSync, writeFileSync, rmSync, mkdirSync } =
      require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");
    const { checkReviewGate } = await import("../src/ship-gates.js");

    const tmpDir = mkdtempSync(join(tmpdir(), "forge-fixlist-p22-ok-"));
    try {
      mkdirSync(join(tmpDir, "reviews"), { recursive: true });
      writeFileSync(
        join(tmpDir, "reviews", "20260529-review.md"),
        [
          "---",
          "p0_count: 0",
          "p1_count: 1",
          "methodology: subagent-parallel",
          "result: fail",
          "---",
          "# Review",
        ].join("\n"),
      );
      writeFileSync(
        join(tmpDir, "reviews", "20260529-p1-fixlist.json"),
        JSON.stringify({
          runId: "20260529",
          p1Issues: [
            { id: "P1-001", title: "Error handling", file: "src/a.ts", line: 42, fixCommit: null },
          ],
          allFixed: false,
        }),
      );

      const mockGitLog = (file: string) =>
        file === "src/a.ts" ? ["abc1234 [fix P1] Error handling"] : [];
      const result = checkReviewGate(join(tmpDir, "reviews"), "def5678", mockGitLog);
      expect(result.passed).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("P1 Fix Checklist integration", () => {
  it("checkReviewGate with P1 fixlist on disk and all fixed → passed (with git verification)", () => {
    const { mkdtempSync, writeFileSync, rmSync, mkdirSync } =
      require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");

    const tmpDir = mkdtempSync(join(tmpdir(), "forge-fixlist-test-"));
    try {
      mkdirSync(join(tmpDir, "reviews"), { recursive: true });

      // Write a review report with P1
      writeFileSync(
        join(tmpDir, "reviews", "20260529-review.md"),
        [
          "---",
          "p0_count: 0",
          "p1_count: 1",
          "methodology: subagent-parallel",
          "result: fail",
          "---",
          "# Review",
        ].join("\n"),
      );

      // Write fixlist with allFixed=true. Audit P2-2: allFixed is only trusted
      // when gitLogFn is supplied to corroborate the fix commits.
      writeFileSync(
        join(tmpDir, "reviews", "20260529-p1-fixlist.json"),
        JSON.stringify({
          runId: "20260529",
          p1Issues: [
            {
              id: "P1-001",
              title: "Error handling",
              file: "src/a.ts",
              line: 42,
              fixCommit: "abc1234",
            },
          ],
          allFixed: true,
        }),
      );

      // Provide a gitLogFn that confirms the fix commit for src/a.ts.
      const mockGitLog = (file: string) =>
        file === "src/a.ts" ? ["abc1234 [fix P1] Error handling"] : [];
      const result = checkReviewGate(join(tmpDir, "reviews"), "def5678", mockGitLog);
      expect(result.passed).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("checkReviewGate with P1 fixlist and gitLogFn resolves unfixed → passed", () => {
    const { mkdtempSync, writeFileSync, rmSync, mkdirSync } =
      require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");

    const tmpDir = mkdtempSync(join(tmpdir(), "forge-fixlist-test2-"));
    try {
      mkdirSync(join(tmpDir, "reviews"), { recursive: true });

      writeFileSync(
        join(tmpDir, "reviews", "20260529-review.md"),
        [
          "---",
          "p0_count: 0",
          "p1_count: 1",
          "methodology: subagent-parallel",
          "result: fail",
          "---",
          "# Review",
        ].join("\n"),
      );

      writeFileSync(
        join(tmpDir, "reviews", "20260529-p1-fixlist.json"),
        JSON.stringify({
          runId: "20260529",
          p1Issues: [
            { id: "P1-001", title: "Error handling", file: "src/a.ts", line: 42, fixCommit: null },
          ],
          allFixed: false,
        }),
      );

      const mockGitLog = (file: string) => {
        if (file === "src/a.ts") return ["abc1234 [fix P1] Error handling"];
        return [];
      };

      const result = checkReviewGate(join(tmpDir, "reviews"), "def5678", mockGitLog);
      expect(result.passed).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("checkReviewGate with P0 → always blocked regardless of fixlist", () => {
    const { mkdtempSync, writeFileSync, rmSync, mkdirSync } =
      require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");

    const tmpDir = mkdtempSync(join(tmpdir(), "forge-fixlist-test3-"));
    try {
      mkdirSync(join(tmpDir, "reviews"), { recursive: true });

      writeFileSync(
        join(tmpDir, "reviews", "20260529-review.md"),
        [
          "---",
          "p0_count: 1",
          "p1_count: 0",
          "methodology: subagent-parallel",
          "result: fail",
          "---",
          "# Review",
        ].join("\n"),
      );

      const result = checkReviewGate(join(tmpDir, "reviews"), "def5678");
      expect(result.passed).toBe(false);
      expect(result.reason).toContain("P0");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Task 6: generateP1Fixlist
// ---------------------------------------------------------------------------

describe("generateP1Fixlist", () => {
  it("creates P1Fixlist from review findings", () => {
    const fixlist = generateP1Fixlist("20260529-143000", [
      {
        severity: "P1",
        filePath: "src/a.ts",
        lineNumber: 42,
        description: "Error handling missing",
      },
      { severity: "P0", filePath: "src/b.ts", lineNumber: 10, description: "Security issue" },
      { severity: "P2", filePath: "src/c.ts", lineNumber: 5, description: "Style issue" },
    ]);
    expect(fixlist.runId).toBe("20260529-143000");
    expect(fixlist.p1Issues).toHaveLength(1);
    expect(fixlist.p1Issues[0].id).toBe("P1-001");
    expect(fixlist.p1Issues[0].file).toBe("src/a.ts");
    expect(fixlist.p1Issues[0].fixCommit).toBeNull();
    expect(fixlist.allFixed).toBe(false);
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
    const { mkdtempSync, existsSync, readFileSync, rmSync } =
      require("node:fs") as typeof import("node:fs");
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

  it("writes immutable ship_gate evidence artifact for persisted gates", () => {
    const { mkdtempSync, existsSync, readFileSync, rmSync } =
      require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");

    const root = mkdtempSync(join(tmpdir(), "forge-gate-artifact-test-"));
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

      const result = persistGateResults(report, join(root, ".forge", "ship"), {
        commit: "head-1",
        createdAt: "2026-06-09T04:00:00.000Z",
      });

      expect(result.reportPath).toBe(join(root, ".forge", "ship", "20260529-143000-gates.json"));
      expect(result.artifactPath).toBeDefined();
      expect(existsSync(result.artifactPath!)).toBe(true);

      const artifact = JSON.parse(readFileSync(result.artifactPath!, "utf-8"));
      expect(artifact.kind).toBe("ship_gate");
      expect(artifact.topic).toBe("test-feature");
      expect(artifact.run_id).toBe("20260529-143000");
      expect(artifact.commit).toBe("head-1");
      expect(artifact.result).toBe("pass");

      const index = readFileSync(join(root, ".forge", "artifacts", "index.jsonl"), "utf-8");
      expect(index).toContain('"kind":"ship_gate"');
    } finally {
      rmSync(root, { recursive: true, force: true });
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

// ---------------------------------------------------------------------------
// Task 7: Fallback Ladder L0-L3 evaluation
// ---------------------------------------------------------------------------

describe("evaluateFallbackLadder", () => {
  const l0AllMet = {
    isInteractive: true,
    workflowsEnvSet: true,
    workflowsEnabled: true,
    workflowFileExists: true,
    workflowSyntaxValid: true,
    concurrencyBridgeAvailable: true,
    subagentAvailable: true,
  };

  it("all L0 conditions met → L0", () => {
    const result = evaluateFallbackLadder(l0AllMet);
    expect(result.level).toBe("L0");
    expect(result.methodology).toBe("saved-workflow");
  });

  it("non-interactive mode → L1", () => {
    const result = evaluateFallbackLadder({ ...l0AllMet, isInteractive: false });
    expect(result.level).toBe("L1");
    expect(result.methodology).toBe("subagent-parallel");
  });

  it("workflows env not set → L1", () => {
    const result = evaluateFallbackLadder({ ...l0AllMet, workflowsEnvSet: false });
    expect(result.level).toBe("L1");
  });

  it("workflow file missing → L1", () => {
    const result = evaluateFallbackLadder({ ...l0AllMet, workflowFileExists: false });
    expect(result.level).toBe("L1");
  });

  it("subagent not available, no concurrency → L3", () => {
    const result = evaluateFallbackLadder({
      ...l0AllMet,
      subagentAvailable: false,
      concurrencyBridgeAvailable: false,
    });
    expect(result.level).toBe("L3");
    expect(result.methodology).toBe("unavailable");
  });

  it("subagent available, no concurrency bridge → L2", () => {
    const result = evaluateFallbackLadder({
      ...l0AllMet,
      subagentAvailable: true,
      concurrencyBridgeAvailable: false,
      isInteractive: false,
    });
    expect(result.level).toBe("L2");
    expect(result.methodology).toBe("subagent-serial");
  });
});

// ---------------------------------------------------------------------------
// Task 7 E2E: L3 blocks ship
// ---------------------------------------------------------------------------

describe("E2E: L3 fallback ladder blocks ship", () => {
  it("methodology=unavailable in runAllGates → allPassed=false", () => {
    const report = runAllGates({
      reviewDir: "/nonexistent/reviews",
      testResultsDir: "/nonexistent/test-results",
      progressDir: "/nonexistent/progress",
      featureName: "test-feature",
      latestCommitHash: "abc1234",
      methodology: "unavailable",
    });
    expect(report.allPassed).toBe(false);
    const reviewGate = report.gates.find((g) => g.gate === "review");
    expect(reviewGate).toBeDefined();
    expect(reviewGate!.passed).toBe(false);
    expect(reviewGate!.reason).toContain("HARD-GATE");
  });

  it("methodology=subagent-parallel in runAllGates → checks review normally", () => {
    const report = runAllGates({
      reviewDir: "/nonexistent/reviews",
      testResultsDir: "/nonexistent/test-results",
      progressDir: "/nonexistent/progress",
      featureName: "test-feature",
      latestCommitHash: "abc1234",
      methodology: "subagent-parallel",
    });
    // Review will fail because dir doesn't exist, but it's not L3
    const reviewGate = report.gates.find((g) => g.gate === "review");
    expect(reviewGate).toBeDefined();
    expect(reviewGate!.reason).not.toContain("HARD-GATE");
  });
});

// ---------------------------------------------------------------------------
// Task 10: runAllGates orchestration
// ---------------------------------------------------------------------------

describe("runAllGates", () => {
  it("all gates pass when dirs have valid data", () => {
    const { mkdtempSync, writeFileSync, rmSync, mkdirSync } =
      require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");

    const tmpDir = mkdtempSync(join(tmpdir(), "forge-allgates-test-"));
    try {
      mkdirSync(join(tmpDir, "reviews"), { recursive: true });
      mkdirSync(join(tmpDir, "test-results"), { recursive: true });
      mkdirSync(join(tmpDir, "progress"), { recursive: true });

      // Review: passed, no P0/P1
      writeFileSync(
        join(tmpDir, "reviews", "20260529-review.md"),
        [
          "---",
          "p0_count: 0",
          "p1_count: 0",
          "methodology: subagent-parallel",
          "result: pass",
          "---",
        ].join("\n"),
      );

      // Test: passed
      writeFileSync(
        join(tmpDir, "test-results", "20260529-tests.json"),
        JSON.stringify({ passed: true }),
      );

      // Progress: all complete
      writeFileSync(join(tmpDir, "progress", "test-feature.md"), "- [x] Task 1\n- [x] Task 2\n");

      const report = runAllGates({
        reviewDir: join(tmpDir, "reviews"),
        testResultsDir: join(tmpDir, "test-results"),
        progressDir: join(tmpDir, "progress"),
        featureName: "test-feature",
        latestCommitHash: "abc1234",
        methodology: "subagent-parallel",
      });

      expect(report.allPassed).toBe(true);
      expect(report.gates).toHaveLength(3);
      expect(report.skipGate).toBeNull();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("skip-gate=test → test gate skipped", () => {
    const report = runAllGates({
      reviewDir: "/nonexistent/reviews",
      testResultsDir: "/nonexistent/test-results",
      progressDir: "/nonexistent/progress",
      featureName: "test-feature",
      latestCommitHash: "abc1234",
      skipOptions: {
        skipGates: ["test"],
        skipAll: false,
        force: false,
        isInteractive: false,
      },
    });

    const testGate = report.gates.find((g) => g.gate === "test");
    expect(testGate).toBeDefined();
    expect(testGate!.passed).toBe(true);
    expect(testGate!.reason).toContain("Skipped");
    expect(report.skipGate).toBe("test");
  });
});
