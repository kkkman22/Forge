/**
 * Property 2: 用户覆盖优先
 *
 * For any task description and any user-specified tier, when the user explicitly
 * specifies a tier, the Router's final output tier ALWAYS equals the user-specified
 * tier, regardless of what the signals indicate.
 *
 * **Validates: Requirements 1.5**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { classifyTask, type TaskSignals, type Tier } from "../src/router.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Arbitrary that produces any valid TaskSignals object (all combinations). */
const taskSignalsArb: fc.Arbitrary<TaskSignals> = fc.record({
  filesAffected: fc.integer({ min: 0, max: 100 }),
  linesChanged: fc.integer({ min: 0, max: 5000 }),
  hasExistingSpec: fc.boolean(),
  hasNewService: fc.boolean(),
  hasNewDatabase: fc.boolean(),
  hasAuthChanges: fc.boolean(),
  isVagueRequirement: fc.boolean(),
  hasClearRequirements: fc.boolean(),
});

/** Arbitrary that produces a random user override tier. */
const tierArb: fc.Arbitrary<Tier> = fc.constantFrom("light", "standard", "full");

// ---------------------------------------------------------------------------
// Expected command sequences per tier
// ---------------------------------------------------------------------------

const EXPECTED_SEQUENCES: Record<Tier, string[]> = {
  light: ["build", "review"],
  standard: ["plan", "build", "review", "test", "ship"],
  full: ["decide", "spec", "plan", "build", "review", "test", "ship", "learn"],
};

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe("Property 2: 用户覆盖优先", () => {
  it("user override tier always wins regardless of signals (Req 1.5)", () => {
    fc.assert(
      fc.property(taskSignalsArb, tierArb, (signals, userOverride) => {
        const result = classifyTask(signals, userOverride);
        expect(result.tier).toBe(userOverride);
      }),
      { numRuns: 50 },
    );
  });

  it("command sequence matches the overridden tier (Req 1.5, 1.6, 1.7, 1.8)", () => {
    fc.assert(
      fc.property(taskSignalsArb, tierArb, (signals, userOverride) => {
        const result = classifyTask(signals, userOverride);
        expect(result.commandSequence).toEqual(EXPECTED_SEQUENCES[userOverride]);
      }),
      { numRuns: 50 },
    );
  });

  it('override to "light" even when signals indicate "full"', () => {
    // Signals that would normally classify as "full"
    const fullSignalsArb: fc.Arbitrary<TaskSignals> = taskSignalsArb.filter(
      (s) => s.hasNewService || s.hasNewDatabase || s.hasAuthChanges || s.isVagueRequirement,
    );

    fc.assert(
      fc.property(fullSignalsArb, (signals) => {
        const result = classifyTask(signals, "light");
        expect(result.tier).toBe("light");
        expect(result.commandSequence).toEqual(EXPECTED_SEQUENCES.light);
      }),
      { numRuns: 50 },
    );
  });

  it('override to "full" even when signals indicate "light"', () => {
    // Signals that would normally classify as "light"
    const lightSignalsArb: fc.Arbitrary<TaskSignals> = fc.record({
      filesAffected: fc.integer({ min: 0, max: 1 }),
      linesChanged: fc.integer({ min: 0, max: 20 }),
      hasExistingSpec: fc.constant(false),
      hasNewService: fc.constant(false),
      hasNewDatabase: fc.constant(false),
      hasAuthChanges: fc.constant(false),
      isVagueRequirement: fc.constant(false),
      hasClearRequirements: fc.constant(false),
    });

    fc.assert(
      fc.property(lightSignalsArb, (signals) => {
        const result = classifyTask(signals, "full");
        expect(result.tier).toBe("full");
        expect(result.commandSequence).toEqual(EXPECTED_SEQUENCES.full);
      }),
      { numRuns: 50 },
    );
  });

  it("result always includes a reason when user override is provided", () => {
    fc.assert(
      fc.property(taskSignalsArb, tierArb, (signals, userOverride) => {
        const result = classifyTask(signals, userOverride);
        expect(result.reason).toBeTruthy();
        expect(typeof result.reason).toBe("string");
        expect(result.reason.length).toBeGreaterThan(0);
      }),
      { numRuns: 50 },
    );
  });
});
