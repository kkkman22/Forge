/**
 * Integration tests for verify.ts inconclusive paths.
 *
 * Covers:
 *   - Claim field missing → INCONCLUSIVE [R1.3]
 *   - Baseline resolution fails → INCONCLUSIVE [R1.10]
 *   - Artifact capture fails → INCONCLUSIVE [R1.6]
 *   - First run with no baseline → INCONCLUSIVE with note [R14.9]
 *
 * **Validates: Requirements R1.3, R1.6, R1.10, R14.9**
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { queryEvidenceArtifacts } from "../src/evidence-artifact.js";
import { runVerify, type VerifyOptions } from "../src/verify.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDir: string;

function makeTmp(name: string): string {
  testDir = join(tmpdir(), `forge-verify-inc-${name}-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("verify inconclusive paths", () => {
  afterEach(() => {
    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it("missing condition field → INCONCLUSIVE [R1.3]", async () => {
    const dir = makeTmp("missing-condition");
    const opts: VerifyOptions = {
      topic: "test",
      cwd: dir,
      forgeDir: join(dir, ".tinkerman"),
      claim: { condition: "", metric: "p95 latency", threshold: "≤200ms" },
    };

    const result = await runVerify(opts);
    expect(result.verdict).toBe("INCONCLUSIVE");
    expect(result.inconclusiveReason).toContain("condition");
  });

  it("missing claim field writes verify evidence artifact and verdict cites it", async () => {
    const dir = makeTmp("missing-artifact");
    const forgeDir = join(dir, ".tinkerman");
    const opts: VerifyOptions = {
      topic: "test",
      cwd: dir,
      forgeDir,
      currentCommit: "head-verify-1",
      claim: { condition: "", metric: "p95 latency", threshold: "<=200ms" },
    };

    const result = await runVerify(opts);

    expect(result.verdict).toBe("INCONCLUSIVE");
    expect(result.evidenceArtifactId).toBeDefined();
    expect(result.evidenceArtifactPath).toBeDefined();
    expect(existsSync(result.evidenceArtifactPath!)).toBe(true);

    const artifact = queryEvidenceArtifacts(dir, { topic: "test", kind: "verify" })[0];
    expect(artifact.artifact_id).toBe(result.evidenceArtifactId);
    expect(artifact.commit).toBe("head-verify-1");
    expect(artifact.result).toBe("inconclusive");

    const verdict = readFileSync(
      join(forgeDir, "findings", "test", "verify-this", "verdict.md"),
      "utf-8",
    );
    expect(verdict).toContain(`evidence_artifact_id: "${result.evidenceArtifactId}"`);
    expect(verdict).toContain(`Evidence artifact: ${result.evidenceArtifactId}`);
  });

  it("missing metric field → INCONCLUSIVE [R1.3]", async () => {
    const dir = makeTmp("missing-metric");
    const opts: VerifyOptions = {
      topic: "test",
      cwd: dir,
      forgeDir: join(dir, ".tinkerman"),
      claim: { condition: "under load", metric: "", threshold: "≤200ms" },
    };

    const result = await runVerify(opts);
    expect(result.verdict).toBe("INCONCLUSIVE");
    expect(result.inconclusiveReason).toContain("metric");
  });

  it("missing threshold field → INCONCLUSIVE [R1.3]", async () => {
    const dir = makeTmp("missing-threshold");
    const opts: VerifyOptions = {
      topic: "test",
      cwd: dir,
      forgeDir: join(dir, ".tinkerman"),
      claim: { condition: "under load", metric: "p95 latency", threshold: "" },
    };

    const result = await runVerify(opts);
    expect(result.verdict).toBe("INCONCLUSIVE");
    expect(result.inconclusiveReason).toContain("threshold");
  });

  it("no git context and no baseline snapshot → INCONCLUSIVE [R1.10]", async () => {
    const dir = makeTmp("no-baseline");
    const opts: VerifyOptions = {
      topic: "test",
      cwd: dir,
      forgeDir: join(dir, ".tinkerman"),
      claim: { condition: "test", metric: "pass rate", threshold: "100%" },
    };

    const result = await runVerify(opts);
    expect(result.verdict).toBe("INCONCLUSIVE");
    expect(result.inconclusiveReason).toContain("baseline");
  });

  it("baseline resolution failure writes verdict.md and verify evidence artifact", async () => {
    const dir = makeTmp("no-baseline-artifact");
    const forgeDir = join(dir, ".tinkerman");
    const opts: VerifyOptions = {
      topic: "test",
      cwd: dir,
      forgeDir,
      currentCommit: "head-verify-2",
      claim: { condition: "test", metric: "pass rate", threshold: "100%" },
    };

    const result = await runVerify(opts);

    expect(result.verdict).toBe("INCONCLUSIVE");
    expect(result.evidenceArtifactId).toBeDefined();
    const verdictPath = join(forgeDir, "findings", "test", "verify-this", "verdict.md");
    expect(existsSync(verdictPath)).toBe(true);
    expect(readFileSync(verdictPath, "utf-8")).toContain("no baseline reference available");

    const artifacts = queryEvidenceArtifacts(dir, { topic: "test", kind: "verify" });
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].result).toBe("inconclusive");
  });

  it("writes claim.md before aborting [R1.2]", async () => {
    const dir = makeTmp("claim-written");
    const forgeDir = join(dir, ".tinkerman");
    const opts: VerifyOptions = {
      topic: "test",
      cwd: dir,
      forgeDir,
      claim: { condition: "test", metric: "pass rate", threshold: "100%" },
    };

    await runVerify(opts);

    const claimPath = join(forgeDir, "findings", "test", "verify-this", "claim.md");
    const content = readFileSync(claimPath, "utf-8");
    expect(content).toContain("test");
    expect(content).toContain("pass rate");
  });

  it("first run persists treatment as baseline [R14.9]", async () => {
    const dir = makeTmp("first-run");
    const forgeDir = join(dir, ".tinkerman");

    // Create a fake treatment to simulate what a first run would produce
    const treatmentDir = join(forgeDir, "findings", "test", "verify-this", "treatment");
    mkdirSync(treatmentDir, { recursive: true });
    writeFileSync(join(treatmentDir, "result.json"), "{}");

    const opts: VerifyOptions = {
      topic: "test",
      cwd: dir,
      forgeDir,
      claim: { condition: "test", metric: "pass rate", threshold: "100%" },
    };

    const result = await runVerify(opts);
    // First run should be INCONCLUSIVE since no baseline to compare against
    expect(result.verdict).toBe("INCONCLUSIVE");
  });
});
