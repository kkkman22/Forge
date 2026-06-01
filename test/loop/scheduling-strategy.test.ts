/**
 * @file Scheduling strategy tests for the Forge Loop engine.
 *
 * Validates delay selection based on failure count × phase,
 * and CronCreate fallback configuration.
 *
 * RED: Will fail until src/loop/scheduling-strategy.ts is created.
 */
import { describe, it, expect } from "vitest";

async function loadModule() {
  return import("../../src/loop/scheduling-strategy.js");
}

describe("Scheduling Strategy", () => {
  // ── Base delay by tier ───────────────────────────────────────────────

  describe("base delay by tier", () => {
    it("light tier default delay is 60s", async () => {
      const { getBaseDelay } = await loadModule();
      expect(getBaseDelay("light")).toBe(60);
    });

    it("standard tier default delay is 120s", async () => {
      const { getBaseDelay } = await loadModule();
      expect(getBaseDelay("standard")).toBe(120);
    });

    it("full tier default delay is 180s", async () => {
      const { getBaseDelay } = await loadModule();
      expect(getBaseDelay("full")).toBe(180);
    });
  });

  // ── Delay with failure backoff ───────────────────────────────────────

  describe("failure backoff", () => {
    it("0 failures → base delay", async () => {
      const { computeDelay } = await loadModule();
      const delay = computeDelay("standard", 0);
      expect(delay).toBe(120);
    });

    it("1 failure → base delay × 2", async () => {
      const { computeDelay } = await loadModule();
      const delay = computeDelay("standard", 1);
      expect(delay).toBe(240);
    });

    it("2 failures → base delay × 3", async () => {
      const { computeDelay } = await loadModule();
      const delay = computeDelay("standard", 2);
      expect(delay).toBe(360);
    });

    it("5 failures → capped at maxDelay", async () => {
      const { computeDelay, MAX_DELAY_SECONDS } = await loadModule();
      const delay = computeDelay("standard", 5);
      expect(delay).toBeLessThanOrEqual(MAX_DELAY_SECONDS);
    });
  });

  // ── Max delay cap ────────────────────────────────────────────────────

  describe("max delay cap", () => {
    it("MAX_DELAY_SECONDS is 3600 (1 hour)", async () => {
      const { MAX_DELAY_SECONDS } = await loadModule();
      expect(MAX_DELAY_SECONDS).toBe(3600);
    });

    it("any combination stays within 60–3600", async () => {
      const { computeDelay } = await loadModule();
      const delays = [
        computeDelay("light", 0),
        computeDelay("light", 3),
        computeDelay("standard", 5),
        computeDelay("full", 10),
      ];
      for (const d of delays) {
        expect(d).toBeGreaterThanOrEqual(60);
        expect(d).toBeLessThanOrEqual(3600);
      }
    });
  });

  // ── ScheduleWakeup vs CronCreate decision ────────────────────────────

  describe("scheduler selection", () => {
    it("prefers ScheduleWakeup for delays < 300s", async () => {
      const { selectScheduler } = await loadModule();
      const result = selectScheduler(120);
      expect(result.method).toBe("ScheduleWakeup");
    });

    it("prefers ScheduleWakeup for delays exactly 300s", async () => {
      const { selectScheduler } = await loadModule();
      const result = selectScheduler(300);
      expect(result.method).toBe("ScheduleWakeup");
    });

    it("falls back to CronCreate for delays > 300s", async () => {
      const { selectScheduler } = await loadModule();
      const result = selectScheduler(600);
      expect(result.method).toBe("CronCreate");
    });
  });

  // ── CronCreate interval conversion ───────────────────────────────────

  describe("CronCreate interval", () => {
    it("converts seconds to cron minute expression", async () => {
      const { toCronInterval } = await loadModule();
      // 600s = 10 minutes
      expect(toCronInterval(600)).toBe("*/10 * * * *");
    });

    it("rounds sub-minute delays to 1 minute", async () => {
      const { toCronInterval } = await loadModule();
      // 30s rounds to 1 min
      expect(toCronInterval(30)).toBe("*/1 * * * *");
    });

    it("handles 1-hour delay", async () => {
      const { toCronInterval } = await loadModule();
      expect(toCronInterval(3600)).toBe("0 * * * *");
    });
  });

  // ── Scheduling context ───────────────────────────────────────────────

  describe("scheduling context", () => {
    it("buildSchedulingContext returns method + delay + reason", async () => {
      const { buildSchedulingContext } = await loadModule();
      const ctx = buildSchedulingContext("standard", 1, "build", "test-loop-123");
      expect(ctx).toHaveProperty("method");
      expect(ctx).toHaveProperty("delaySeconds");
      expect(ctx).toHaveProperty("reason");
      expect(ctx.reason).toContain("build");
    });
  });
});
