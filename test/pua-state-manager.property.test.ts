/**
 * Property-based tests for the PUA state manager module.
 *
 * Covers:
 *   - Property 2: PUA state manager — success resets state
 *   - Property 3: PUA state manager — failure escalation monotonicity
 *
 * **Validates: Requirements 5.2, 5.3, 5.7**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { PressureLevel } from "../src/pua-engine.js";
import { PuaStateManager, type PuaStateManagerDeps } from "../src/pua-state-manager.js";
import { extractPuaFields } from "../src/status-file-ext.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Initial StatusFile content with valid YAML frontmatter. */
const INITIAL_STATUS = `---
phase: "build"
---
`;

/**
 * Create a PuaStateManager with mock deps that track StatusFile content.
 * Returns the manager and a getter for the current StatusFile content.
 */
function createMockManager(taskType = "general"): {
  manager: PuaStateManager;
  getStatusContent: () => string;
  getWarnings: () => string[];
} {
  let statusContent = INITIAL_STATUS;
  const warnings: string[] = [];

  const deps: PuaStateManagerDeps = {
    readStatusFile: () => statusContent,
    writeStatusFile: (content: string) => {
      statusContent = content;
    },
    warn: (message: string) => {
      warnings.push(message);
    },
  };

  return {
    manager: new PuaStateManager(deps, taskType),
    getStatusContent: () => statusContent,
    getWarnings: () => warnings,
  };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Arbitrary non-empty summary string (simulating iteration summaries). */
const summaryArb = fc.string({ minLength: 1, maxLength: 100 });

/**
 * Arbitrary sequence of handleFailure calls: array of { summary, consecutiveFailures }.
 * consecutiveFailures increases from 1..n to simulate realistic escalation.
 */
const failureSequenceArb = fc.array(summaryArb, { minLength: 1, maxLength: 10 }).map((summaries) =>
  summaries.map((summary, i) => ({
    summary,
    consecutiveFailures: i + 1,
  })),
);

// ---------------------------------------------------------------------------
// Property 2: PUA state manager — success resets state
// ---------------------------------------------------------------------------

describe("Property 2: PUA state manager — success resets state", () => {
  /**
   * **Validates: Requirements 5.2, 5.7**
   *
   * After any sequence of handleFailure calls followed by handleSuccess,
   * the PUA fields are cleared from the StatusFile.
   */
  it("handleSuccess clears all PUA fields from StatusFile after arbitrary failure sequences", () => {
    fc.assert(
      fc.property(failureSequenceArb, (failures) => {
        const { manager, getStatusContent } = createMockManager();

        // Apply arbitrary failure sequence
        for (const { summary, consecutiveFailures } of failures) {
          manager.handleFailure(summary, consecutiveFailures);
        }

        // Verify PUA fields were written during failures
        const preSuccessFields = extractPuaFields(getStatusContent());
        expect(preSuccessFields.puaPressureLevel).toBeDefined();

        // Call handleSuccess
        manager.handleSuccess();

        // Verify all PUA fields are cleared
        const postSuccessFields = extractPuaFields(getStatusContent());
        expect(postSuccessFields.puaPressureLevel).toBeUndefined();
        expect(postSuccessFields.puaMethodology).toBeUndefined();
        expect(postSuccessFields.puaChainIndex).toBeUndefined();
        expect(postSuccessFields.puaFailurePattern).toBeUndefined();
      }),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 5.2, 5.7**
   *
   * After handleSuccess, the next handleFailure(summary, 1) should behave
   * identically to a fresh manager's handleFailure(summary, 1) — proving
   * internal state was fully reset.
   */
  it("after handleSuccess, next handleFailure behaves identically to a fresh manager", () => {
    fc.assert(
      fc.property(failureSequenceArb, summaryArb, (failures, freshSummary) => {
        // Manager that goes through failures then success
        const { manager: resetManager, getStatusContent: getResetStatus } = createMockManager();

        for (const { summary, consecutiveFailures } of failures) {
          resetManager.handleFailure(summary, consecutiveFailures);
        }
        resetManager.handleSuccess();

        // Apply a single failure after reset
        resetManager.handleFailure(freshSummary, 1);
        const resetFields = extractPuaFields(getResetStatus());

        // Fresh manager with same single failure
        const { manager: freshManager, getStatusContent: getFreshStatus } = createMockManager();
        freshManager.handleFailure(freshSummary, 1);
        const freshFields = extractPuaFields(getFreshStatus());

        // Both should produce identical PUA state
        expect(resetFields.puaPressureLevel).toBe(freshFields.puaPressureLevel);
        expect(resetFields.puaMethodology).toBe(freshFields.puaMethodology);
        expect(resetFields.puaChainIndex).toBe(freshFields.puaChainIndex);
        expect(resetFields.puaFailurePattern).toBe(freshFields.puaFailurePattern);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 5.2, 5.7**
   *
   * handleSuccess is idempotent — calling it multiple times produces the
   * same cleared state.
   */
  it("handleSuccess is idempotent — multiple calls produce same cleared state", () => {
    fc.assert(
      fc.property(failureSequenceArb, (failures) => {
        const { manager, getStatusContent } = createMockManager();

        for (const { summary, consecutiveFailures } of failures) {
          manager.handleFailure(summary, consecutiveFailures);
        }

        manager.handleSuccess();
        const afterFirst = getStatusContent();

        manager.handleSuccess();
        const afterSecond = getStatusContent();

        expect(afterFirst).toBe(afterSecond);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 5.2, 5.7**
   *
   * Non-PUA fields in the StatusFile are preserved after handleSuccess.
   */
  it("handleSuccess preserves non-PUA fields in StatusFile", () => {
    fc.assert(
      fc.property(failureSequenceArb, (failures) => {
        const { manager, getStatusContent } = createMockManager();

        for (const { summary, consecutiveFailures } of failures) {
          manager.handleFailure(summary, consecutiveFailures);
        }

        manager.handleSuccess();

        // The original "phase" field should still be present
        const content = getStatusContent();
        expect(content).toContain("phase:");
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: PUA state manager — failure escalation monotonicity
// ---------------------------------------------------------------------------

/**
 * Numeric ordering for pressure levels, used to verify monotonicity.
 */
const PRESSURE_LEVEL_ORDER: Record<PressureLevel, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4,
};

describe("Property 3: PUA state manager — failure escalation monotonicity", () => {
  /**
   * **Validates: Requirements 5.3, 5.7**
   *
   * For consecutive handleFailure calls with strictly increasing
   * consecutiveFailures (1, 2, 3, ..., n), the puaPressureLevel
   * extracted from the StatusFile forms a non-decreasing sequence.
   */
  it("pressure level is non-decreasing for increasing consecutiveFailures", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 10, maxLength: 10 }),
        (sequenceLength, summaryPool) => {
          const { manager, getStatusContent } = createMockManager();

          const pressureLevels: PressureLevel[] = [];

          for (let i = 1; i <= sequenceLength; i++) {
            // Use a summary from the pool (cycling if needed)
            const summary = summaryPool[(i - 1) % summaryPool.length];
            manager.handleFailure(summary, i);

            const fields = extractPuaFields(getStatusContent());
            // At consecutiveFailures >= 2, pressure level should be defined
            // At consecutiveFailures === 1, it may be L0 (which means no PUA fields written for L0)
            const level = fields.puaPressureLevel ?? "L0";
            pressureLevels.push(level);
          }

          // Verify non-decreasing: each level >= previous level
          for (let i = 1; i < pressureLevels.length; i++) {
            expect(PRESSURE_LEVEL_ORDER[pressureLevels[i]]).toBeGreaterThanOrEqual(
              PRESSURE_LEVEL_ORDER[pressureLevels[i - 1]],
            );
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 5.3, 5.7**
   *
   * For a long escalation sequence (1 through 8), the pressure level
   * eventually reaches L4 and stays there.
   */
  it("pressure level eventually reaches L4 and stays there for high failure counts", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 8, maxLength: 8 }),
        (summaries) => {
          const { manager, getStatusContent } = createMockManager();

          let reachedL4 = false;

          for (let i = 1; i <= 8; i++) {
            manager.handleFailure(summaries[i - 1], i);

            const fields = extractPuaFields(getStatusContent());
            const level = fields.puaPressureLevel ?? "L0";

            if (level === "L4") {
              reachedL4 = true;
            }

            // Once L4 is reached, it must stay at L4
            if (reachedL4) {
              expect(level).toBe("L4");
            }
          }

          // With 8 consecutive failures, L4 must have been reached
          expect(reachedL4).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });
});
