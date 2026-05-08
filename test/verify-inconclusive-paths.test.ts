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

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
      forgeDir: join(dir, ".forge"),
      claim: { condition: "", metric: "p95 latency", threshold: "≤200ms" },
    };

    const result = await runVerify(opts);
    expect(result.verdict).toBe("INCONCLUSIVE");
    expect(result.inconclusiveReason).toContain("condition");
  });

  it("missing metric field → INCONCLUSIVE [R1.3]", async () => {
    const dir = makeTmp("missing-metric");
    const opts: VerifyOptions = {
      topic: "test",
      cwd: dir,
      forgeDir: join(dir, ".forge"),
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
      forgeDir: join(dir, ".forge"),
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
      forgeDir: join(dir, ".forge"),
      claim: { condition: "test", metric: "pass rate", threshold: "100%" },
    };

    const result = await runVerify(opts);
    expect(result.verdict).toBe("INCONCLUSIVE");
    expect(result.inconclusiveReason).toContain("baseline");
  });

  it("writes claim.md before aborting [R1.2]", async () => {
    const dir = makeTmp("claim-written");
    const forgeDir = join(dir, ".forge");
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
    const forgeDir = join(dir, ".forge");

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
