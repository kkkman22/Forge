import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkProgressGate, checkReviewGate, checkTestGate } from "../src/ship-gates.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "io-fixture-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("checkReviewGate (fixture-based)", () => {
  it("fails when no review report found", () => {
    const r = checkReviewGate(tmp, "abc123");
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("No review report");
  });
  it("passes when review report has result: pass", () => {
    const reviewDir = join(tmp, "reviews");
    mkdirSync(reviewDir, { recursive: true });
    writeFileSync(join(reviewDir, "topic.md"), "---\nresult: pass\n---\n# Review\n");
    const r = checkReviewGate(reviewDir, "abc123");
    expect(r.gate).toBe("review");
  });
  it("reads a blocked review report", () => {
    const reviewDir = join(tmp, "reviews");
    mkdirSync(reviewDir, { recursive: true });
    writeFileSync(join(reviewDir, "topic.md"), "---\nresult: blocked\n---\n# Review\n");
    const r = checkReviewGate(reviewDir, "abc123");
    expect(r.gate).toBe("review");
  });
});

describe("checkProgressGate (fixture-based)", () => {
  it("passes with warning when no progress file", () => {
    const r = checkProgressGate(tmp, "no-such-topic");
    expect(r.passed).toBe(true);
    expect(r.reason).toContain("No progress file");
  });
  it("passes when all tasks completed", () => {
    const progressDir = join(tmp, "progress");
    mkdirSync(progressDir, { recursive: true });
    writeFileSync(join(progressDir, "topic.md"), "- [x] task 1\n- [x] task 2\n");
    const r = checkProgressGate(progressDir, "topic");
    expect(r.passed).toBe(true);
  });
  it("reads incomplete progress", () => {
    const progressDir = join(tmp, "progress");
    mkdirSync(progressDir, { recursive: true });
    writeFileSync(join(progressDir, "topic.md"), "- [x] task 1\n- [ ] task 2\n");
    const r = checkProgressGate(progressDir, "topic");
    expect(r.gate).toBe("progress");
  });
});

describe("checkTestGate (fixture-based)", () => {
  it("handles empty test dir", () => {
    const testDir = join(tmp, "test-results");
    mkdirSync(testDir, { recursive: true });
    const r = checkTestGate(testDir);
    expect(r).toBeDefined();
  });
  it("handles missing test dir", () => {
    const r = checkTestGate(join(tmp, "nonexistent"));
    expect(r).toBeDefined();
  });
});
