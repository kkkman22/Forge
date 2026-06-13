import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAllGates } from "../src/ship-gates.js";

let tmp: string;
let reviewDir: string;
let testDir: string;
let progressDir: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "gates-"));
  reviewDir = join(tmp, "reviews");
  testDir = join(tmp, "test-results");
  progressDir = join(tmp, "progress");
  for (const d of [reviewDir, testDir, progressDir]) mkdirSync(d, { recursive: true });
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("runAllGates (fixture-based branch coverage)", () => {
  it("runs all gates with no skip (all pass on empty)", () => {
    const r = runAllGates({
      reviewDir,
      testResultsDir: testDir,
      progressDir,
      featureName: "topic",
      latestCommitHash: "abc123",
    });
    expect(r.gates.length).toBeGreaterThan(0);
    expect(r.runId).toBeDefined();
  });
  it("skipAll=true skips review+test+progress gates", () => {
    const r = runAllGates({
      reviewDir,
      testResultsDir: testDir,
      progressDir,
      featureName: "topic",
      latestCommitHash: "abc123",
      skipOptions: { skipAll: true, skipGates: [], force: true, isInteractive: false },
    });
    expect(r.skipGate).toContain("all");
  });
  it("skip individual gates", () => {
    const r = runAllGates({
      reviewDir,
      testResultsDir: testDir,
      progressDir,
      featureName: "topic",
      latestCommitHash: "abc123",
      skipOptions: {
        skipAll: false,
        skipGates: ["review" as never],
        force: false,
        isInteractive: false,
      },
    });
    expect(r.skipGate).toContain("review");
  });
  it("reads passing review report + progress file", () => {
    writeFileSync(join(reviewDir, "topic.md"), "---\nresult: pass\n---\n");
    writeFileSync(join(progressDir, "topic.md"), "- [x] done\n");
    const r = runAllGates({
      reviewDir,
      testResultsDir: testDir,
      progressDir,
      featureName: "topic",
      latestCommitHash: "abc123",
    });
    expect(r.gates.length).toBeGreaterThan(0);
  });
  it("reads failing review report", () => {
    writeFileSync(join(reviewDir, "topic.md"), "---\nresult: blocked\n---\n");
    const r = runAllGates({
      reviewDir,
      testResultsDir: testDir,
      progressDir,
      featureName: "topic",
      latestCommitHash: "abc123",
    });
    const reviewGate = r.gates.find((g) => g.gate === "review");
    expect(reviewGate).toBeDefined();
  });
  it("handles missing progress file (lightweight pass)", () => {
    writeFileSync(join(reviewDir, "topic.md"), "---\nresult: pass\n---\n");
    const r = runAllGates({
      reviewDir,
      testResultsDir: testDir,
      progressDir,
      featureName: "nonexistent",
      latestCommitHash: "abc123",
    });
    const progressGate = r.gates.find((g) => g.gate === "progress");
    expect(progressGate?.passed).toBe(true);
  });
});
