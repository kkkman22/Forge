/**
 * Build wave scheduling + three-strike debug reroute tests.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { scheduleWave, buildThreeStrikeDebugReroute } from "../src/build.js";
import type { Wave, FixFailure } from "../src/spec-bundle.js";

// ---------------------------------------------------------------------------
// scheduleWave
// ---------------------------------------------------------------------------

describe("scheduleWave", () => {
  it("executes all tasks in a wave", async () => {
    const wave: Wave = { id: "W1", taskIds: ["T-01", "T-02", "T-03"] };
    const executed: string[] = [];
    const result = await scheduleWave(wave, {
      maxConcurrency: 6,
      executor: async (id) => { executed.push(id); return true; },
    });
    expect(result.completed).toHaveLength(3);
    expect(result.failed).toHaveLength(0);
    expect(executed).toHaveLength(3);
  });

  it("tracks failed tasks", async () => {
    const wave: Wave = { id: "W1", taskIds: ["T-01", "T-02"] };
    const result = await scheduleWave(wave, {
      maxConcurrency: 6,
      executor: async (id) => id === "T-01",
    });
    expect(result.completed).toEqual(["T-01"]);
    expect(result.failed).toEqual(["T-02"]);
  });

  it("degrades concurrency on 429 signal", async () => {
    const wave: Wave = { id: "W1", taskIds: ["T-01", "T-02", "T-03", "T-04"] };
    let callCount = 0;
    const batches: number[] = [];
    const result = await scheduleWave(wave, {
      maxConcurrency: 4,
      executor: async (id) => { return true; },
      onHttp429: () => {
        callCount++;
        batches.push(callCount);
      },
    });
    expect(result.degraded429).toBe(true);
    expect(callCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildThreeStrikeDebugReroute
// ---------------------------------------------------------------------------

describe("buildThreeStrikeDebugReroute", () => {
  it("does not write debug file when reroute is false", () => {
    const dir = join(tmpdir(), `forge-test-${Date.now()}`);
    try {
      const failure: FixFailure = { testName: "test-a", firstLine: "Expected 1" };
      const result = buildThreeStrikeDebugReroute([], failure, dir, "my-topic");
      expect(result.reroute).toBe(false);
      expect(existsSync(join(dir, "my-topic.md"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes debug file when reroute triggers (3+ same signature)", () => {
    const dir = join(tmpdir(), `forge-test-${Date.now()}`);
    try {
      const failure: FixFailure = { testName: "test-a", firstLine: "Expected 1" };
      const history: FixFailure[] = [
        { testName: "test-a", firstLine: "Expected 1" },
        { testName: "test-a", firstLine: "Expected 1" },
      ];
      const result = buildThreeStrikeDebugReroute(history, failure, dir, "my-topic");
      expect(result.reroute).toBe(true);
      expect(existsSync(join(dir, "my-topic.md"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("includes fail_signature in debug file", () => {
    const dir = join(tmpdir(), `forge-test-${Date.now()}`);
    try {
      const failure: FixFailure = { testName: "test-a", firstLine: "Expected 1" };
      const history: FixFailure[] = [
        { testName: "test-a", firstLine: "Expected 1" },
        { testName: "test-a", firstLine: "Expected 1" },
      ];
      buildThreeStrikeDebugReroute(history, failure, dir, "sig-test");
      const content = readFileSync(join(dir, "sig-test.md"), "utf-8");
      expect(content).toContain("fail_signature");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
