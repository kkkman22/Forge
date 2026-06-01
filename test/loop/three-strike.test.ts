/**
 * @file Three-strike failure detection and Git transaction tests.
 *
 * Validates: consecutiveFailures increment, halt at ≥3, Git rollback
 * on failure, success reset + commit, and boundary conditions.
 *
 * RED: Will fail until src/loop/three-strike.ts is created.
 */
import { describe, it, expect } from "vitest";

async function loadModule() {
  return import("../../src/loop/three-strike.js");
}

describe("Three-Strike Failure Logic", () => {
  // ── consecutiveFailures increment ────────────────────────────────────

  describe("failure tracking", () => {
    it("increments consecutiveFailures from 0 to 1", async () => {
      const { recordFailure } = await loadModule();
      const state = { consecutiveFailures: 0, phase: "build" as const };
      const result = recordFailure(state);
      expect(result.consecutiveFailures).toBe(1);
    });

    it("increments consecutiveFailures from 2 to 3", async () => {
      const { recordFailure } = await loadModule();
      const state = { consecutiveFailures: 2, phase: "build" as const };
      const result = recordFailure(state);
      expect(result.consecutiveFailures).toBe(3);
    });

    it("preserves phase on non-terminal failure", async () => {
      const { recordFailure } = await loadModule();
      const state = { consecutiveFailures: 1, phase: "review" as const };
      const result = recordFailure(state);
      expect(result.phase).toBe("review");
    });
  });

  // ── ≥3 triggers halt ─────────────────────────────────────────────────

  describe("halt trigger", () => {
    it("shouldHalt returns false at 0 failures", async () => {
      const { shouldHalt } = await loadModule();
      expect(shouldHalt({ consecutiveFailures: 0 })).toBe(false);
    });

    it("shouldHalt returns false at 1 failure", async () => {
      const { shouldHalt } = await loadModule();
      expect(shouldHalt({ consecutiveFailures: 1 })).toBe(false);
    });

    it("shouldHalt returns false at 2 failures", async () => {
      const { shouldHalt } = await loadModule();
      expect(shouldHalt({ consecutiveFailures: 2 })).toBe(false);
    });

    it("shouldHalt returns true at 3 failures", async () => {
      const { shouldHalt } = await loadModule();
      expect(shouldHalt({ consecutiveFailures: 3 })).toBe(true);
    });

    it("shouldHalt returns true at 5 failures", async () => {
      const { shouldHalt } = await loadModule();
      expect(shouldHalt({ consecutiveFailures: 5 })).toBe(true);
    });

    it("recordFailure at 2 → 3 triggers halt via shouldHalt", async () => {
      const { recordFailure, shouldHalt } = await loadModule();
      const result = recordFailure({ consecutiveFailures: 2, phase: "build" as const });
      expect(shouldHalt(result)).toBe(true);
    });
  });

  // ── haltReason ───────────────────────────────────────────────────────

  describe("halt reason", () => {
    it("computeHaltReason returns three-strike message", async () => {
      const { computeHaltReason } = await loadModule();
      const reason = computeHaltReason(3, "build");
      expect(reason).toContain("3");
      expect(reason).toContain("build");
      expect(typeof reason).toBe("string");
      expect(reason.length).toBeGreaterThan(0);
    });
  });

  // ── success resets counter ───────────────────────────────────────────

  describe("success reset", () => {
    it("recordSuccess resets consecutiveFailures to 0", async () => {
      const { recordSuccess } = await loadModule();
      const state = { consecutiveFailures: 2, phase: "build" as const, lastSuccessCommit: "" };
      const result = recordSuccess(state, "abc123");
      expect(result.consecutiveFailures).toBe(0);
    });

    it("recordSuccess updates lastSuccessCommit", async () => {
      const { recordSuccess } = await loadModule();
      const state = { consecutiveFailures: 1, phase: "build" as const, lastSuccessCommit: "" };
      const result = recordSuccess(state, "deadbeef");
      expect(result.lastSuccessCommit).toBe("deadbeef");
    });

    it("recordSuccess does not change phase", async () => {
      const { recordSuccess } = await loadModule();
      const state = { consecutiveFailures: 0, phase: "review" as const, lastSuccessCommit: "" };
      const result = recordSuccess(state, "abc");
      expect(result.phase).toBe("review");
    });
  });

  // ── Git rollback decision ────────────────────────────────────────────

  describe("git rollback decision", () => {
    it("shouldRollback returns true when failures > 0 and lastSuccessCommit exists", async () => {
      const { shouldRollback } = await loadModule();
      expect(
        shouldRollback({
          consecutiveFailures: 1,
          lastSuccessCommit: "abc123",
        }),
      ).toBe(true);
    });

    it("shouldRollback returns false when no previous success commit", async () => {
      const { shouldRollback } = await loadModule();
      expect(
        shouldRollback({
          consecutiveFailures: 2,
          lastSuccessCommit: "",
        }),
      ).toBe(false);
    });

    it("shouldRollback returns false when consecutiveFailures is 0", async () => {
      const { shouldRollback } = await loadModule();
      expect(
        shouldRollback({
          consecutiveFailures: 0,
          lastSuccessCommit: "abc123",
        }),
      ).toBe(false);
    });
  });

  // ── rollback target ──────────────────────────────────────────────────

  describe("rollback target", () => {
    it("getRollbackTarget returns lastSuccessCommit", async () => {
      const { getRollbackTarget } = await loadModule();
      expect(getRollbackTarget({ lastSuccessCommit: "deadbeef" })).toBe("deadbeef");
    });
  });
});
