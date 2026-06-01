/**
 * @file Phase transition logic tests for the Forge Loop engine.
 *
 * Validates the transition table for all tier × phase combinations,
 * including the special review P0/P1 → build rollback path.
 *
 * RED: This test will fail until src/loop/phase-transitions.ts is created.
 */
import { describe, expect, it } from "vitest";

type Tier = "light" | "standard" | "full";
type Phase =
  | "init"
  | "plan"
  | "build"
  | "review"
  | "test"
  | "ship"
  | "learn"
  | "halted"
  | "completed";
type ReviewResult = "passed" | "failed-p0" | "failed-p1" | "not-run";

// The function under test — will fail on import until the module exists
async function loadModule() {
  return import("../../src/loop/phase-transitions.js");
}

describe("Phase Transition Logic", () => {
  // ── Light tier ──────────────────────────────────────────────────────

  describe("light tier", () => {
    it("init → build", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("init", "light")).toBe("build");
    });

    it("build → review", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("build", "light")).toBe("review");
    });

    it("review (passed) → completed", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("review", "light", "passed")).toBe("completed");
    });

    it("review (failed-p0) → build (rollback)", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("review", "light", "failed-p0")).toBe("build");
    });

    it("review (failed-p1) → build (rollback)", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("review", "light", "failed-p1")).toBe("build");
    });
  });

  // ── Standard tier ───────────────────────────────────────────────────

  describe("standard tier", () => {
    it("init → plan", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("init", "standard")).toBe("plan");
    });

    it("plan → build", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("plan", "standard")).toBe("build");
    });

    it("build → review", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("build", "standard")).toBe("review");
    });

    it("review (passed) → test", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("review", "standard", "passed")).toBe("test");
    });

    it("review (failed-p0) → build (rollback)", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("review", "standard", "failed-p0")).toBe("build");
    });

    it("review (failed-p1) → build (rollback)", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("review", "standard", "failed-p1")).toBe("build");
    });

    it("test → ship", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("test", "standard")).toBe("ship");
    });

    it("ship → completed", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("ship", "standard")).toBe("completed");
    });
  });

  // ── Full tier ───────────────────────────────────────────────────────

  describe("full tier", () => {
    it("init → plan", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("init", "full")).toBe("plan");
    });

    it("plan → build", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("plan", "full")).toBe("build");
    });

    it("build → review", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("build", "full")).toBe("review");
    });

    it("review (passed) → test", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("review", "full", "passed")).toBe("test");
    });

    it("review (failed-p0) → build (rollback)", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("review", "full", "failed-p0")).toBe("build");
    });

    it("review (failed-p1) → build (rollback)", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("review", "full", "failed-p1")).toBe("build");
    });

    it("test → ship", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("test", "full")).toBe("ship");
    });

    it("ship → learn", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("ship", "full")).toBe("learn");
    });

    it("learn → completed", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("learn", "full")).toBe("completed");
    });
  });

  // ── Terminal phases ─────────────────────────────────────────────────

  describe("terminal phases", () => {
    it("completed → completed (idempotent)", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("completed", "standard")).toBe("completed");
    });

    it("halted → halted (idempotent)", async () => {
      const { getNextPhase } = await loadModule();
      expect(getNextPhase("halted", "standard")).toBe("halted");
    });
  });

  // ── Review result required for review phase ─────────────────────────

  describe("review phase without result", () => {
    it("review without reviewResult throws", async () => {
      const { getNextPhase } = await loadModule();
      expect(() => getNextPhase("review", "standard")).toThrow();
    });
  });

  // ── Transition table completeness ───────────────────────────────────

  describe("transition table coverage", () => {
    it("exports TRANSITION_TABLE with all tiers", async () => {
      const { TRANSITION_TABLE } = await loadModule();
      expect(TRANSITION_TABLE).toHaveProperty("light");
      expect(TRANSITION_TABLE).toHaveProperty("standard");
      expect(TRANSITION_TABLE).toHaveProperty("full");
    });
  });
});
