/**
 * Property 1: Router 分类正确性
 *
 * Uses fast-check to generate TaskSignals with complexity signals and verifies
 * that the Router classification result matches the tier indicated by the signals.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { classifyTask, type ProjectContext, type TaskSignals, type Tier } from "../src/router.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Arbitrary that produces a valid TaskSignals object. */
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

/**
 * Generates signals that are guaranteed to trigger the "full" tier.
 * At least one full signal is true.
 */
const fullSignalsArb: fc.Arbitrary<TaskSignals> = taskSignalsArb.filter(
  (s) => s.hasNewService || s.hasNewDatabase || s.hasAuthChanges || s.isVagueRequirement,
);

/**
 * Generates signals that trigger "standard" tier:
 * - No full signals
 * - At least one standard signal (hasExistingSpec or hasClearRequirements)
 */
const standardSignalsArb: fc.Arbitrary<TaskSignals> = taskSignalsArb
  .map((s) => ({
    ...s,
    hasNewService: false,
    hasNewDatabase: false,
    hasAuthChanges: false,
    isVagueRequirement: false,
  }))
  .filter((s) => s.hasExistingSpec || s.hasClearRequirements);

/**
 * Generates signals that trigger "light" tier:
 * - No full signals
 * - No standard signals
 * - filesAffected ≤ 1 AND linesChanged ≤ 20
 */
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

/**
 * Generates signals that fall through to the default tier:
 * - No full signals
 * - No standard signals
 * - NOT light (filesAffected > 1 OR linesChanged > 20)
 */
const defaultSignalsArb: fc.Arbitrary<TaskSignals> = fc
  .record({
    filesAffected: fc.integer({ min: 0, max: 100 }),
    linesChanged: fc.integer({ min: 0, max: 5000 }),
    hasExistingSpec: fc.constant(false),
    hasNewService: fc.constant(false),
    hasNewDatabase: fc.constant(false),
    hasAuthChanges: fc.constant(false),
    isVagueRequirement: fc.constant(false),
    hasClearRequirements: fc.constant(false),
  })
  .filter((s) => s.filesAffected > 1 || s.linesChanged > 20);

// ---------------------------------------------------------------------------
// Expected command sequences
// ---------------------------------------------------------------------------

const EXPECTED_SEQUENCES: Record<Tier, string[]> = {
  light: ["build", "review"],
  standard: ["plan", "build", "review", "test", "ship"],
  full: ["decide", "spec", "plan", "build", "review", "test", "ship", "learn"],
};

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe("Property 1: Router 分类正确性", () => {
  it('full signals → tier is "full" (Req 1.4: 涉及新服务/新数据库/认证体系变更或需求模糊 → 全量)', () => {
    fc.assert(
      fc.property(fullSignalsArb, (signals) => {
        const result = classifyTask(signals);
        expect(result.tier).toBe("full");
        expect(result.commandSequence).toEqual(EXPECTED_SEQUENCES.full);
      }),
      { numRuns: 200 },
    );
  });

  it('standard signals (no full signals) → tier is "standard" (Req 1.3: 有明确需求或现成 Spec → 标准)', () => {
    fc.assert(
      fc.property(standardSignalsArb, (signals) => {
        const result = classifyTask(signals);
        expect(result.tier).toBe("standard");
        expect(result.commandSequence).toEqual(EXPECTED_SEQUENCES.standard);
      }),
      { numRuns: 200 },
    );
  });

  it('light signals (no full/standard signals, files ≤ 1, lines ≤ 20) → tier is "light" (Req 1.2)', () => {
    fc.assert(
      fc.property(lightSignalsArb, (signals) => {
        const result = classifyTask(signals);
        expect(result.tier).toBe("light");
        expect(result.commandSequence).toEqual(EXPECTED_SEQUENCES.light);
      }),
      { numRuns: 200 },
    );
  });

  it('no signals match → default tier is "standard" (Req 1.1: 默认标准)', () => {
    fc.assert(
      fc.property(defaultSignalsArb, (signals) => {
        const result = classifyTask(signals);
        expect(result.tier).toBe("standard");
        expect(result.commandSequence).toEqual(EXPECTED_SEQUENCES.standard);
      }),
      { numRuns: 200 },
    );
  });

  it("full signals always take priority over standard and light signals", () => {
    fc.assert(
      fc.property(
        taskSignalsArb.filter(
          (s) =>
            // Has at least one full signal AND at least one standard/light signal
            (s.hasNewService || s.hasNewDatabase || s.hasAuthChanges || s.isVagueRequirement) &&
            (s.hasExistingSpec ||
              s.hasClearRequirements ||
              (s.filesAffected <= 1 && s.linesChanged <= 20)),
        ),
        (signals) => {
          const result = classifyTask(signals);
          expect(result.tier).toBe("full");
          expect(result.commandSequence).toEqual(EXPECTED_SEQUENCES.full);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("standard signals take priority over light signals", () => {
    fc.assert(
      fc.property(
        fc
          .record({
            filesAffected: fc.integer({ min: 0, max: 1 }),
            linesChanged: fc.integer({ min: 0, max: 20 }),
            hasExistingSpec: fc.boolean(),
            hasNewService: fc.constant(false),
            hasNewDatabase: fc.constant(false),
            hasAuthChanges: fc.constant(false),
            isVagueRequirement: fc.constant(false),
            hasClearRequirements: fc.boolean(),
          })
          .filter((s) => s.hasExistingSpec || s.hasClearRequirements),
        (signals) => {
          // Even though light conditions are met, standard signals win
          const result = classifyTask(signals);
          expect(result.tier).toBe("standard");
          expect(result.commandSequence).toEqual(EXPECTED_SEQUENCES.standard);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("classification always returns a valid command sequence for the assigned tier", () => {
    fc.assert(
      fc.property(taskSignalsArb, (signals) => {
        const result = classifyTask(signals);
        expect(["light", "standard", "full"]).toContain(result.tier);
        expect(result.commandSequence).toEqual(EXPECTED_SEQUENCES[result.tier]);
        expect(result.reason).toBeTruthy();
      }),
      { numRuns: 500 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 23: Brownfield boost — light → standard for brownfield projects
// ---------------------------------------------------------------------------

describe("Property 23: Brownfield boost", () => {
  const brownfieldTouchingModules: ProjectContext = {
    projectType: "brownfield",
    touchesExistingModules: true,
  };

  const brownfieldNotTouching: ProjectContext = {
    projectType: "brownfield",
    touchesExistingModules: false,
  };

  const greenfieldContext: ProjectContext = {
    projectType: "greenfield",
    touchesExistingModules: true,
  };

  const unknownContext: ProjectContext = {
    projectType: "unknown",
    touchesExistingModules: true,
  };

  it("brownfield + touches existing modules boosts light → standard", () => {
    fc.assert(
      fc.property(lightSignalsArb, (signals) => {
        const result = classifyTask(signals, undefined, brownfieldTouchingModules);
        expect(result.tier).toBe("standard");
        expect(result.reason).toContain("棕地");
      }),
      { numRuns: 200 },
    );
  });

  it("brownfield + NOT touching existing modules stays light", () => {
    fc.assert(
      fc.property(lightSignalsArb, (signals) => {
        const result = classifyTask(signals, undefined, brownfieldNotTouching);
        expect(result.tier).toBe("light");
      }),
      { numRuns: 200 },
    );
  });

  it("greenfield context does not boost light", () => {
    fc.assert(
      fc.property(lightSignalsArb, (signals) => {
        const result = classifyTask(signals, undefined, greenfieldContext);
        expect(result.tier).toBe("light");
      }),
      { numRuns: 200 },
    );
  });

  it("unknown context does not boost light", () => {
    fc.assert(
      fc.property(lightSignalsArb, (signals) => {
        const result = classifyTask(signals, undefined, unknownContext);
        expect(result.tier).toBe("light");
      }),
      { numRuns: 200 },
    );
  });

  it("brownfield boost does not affect full signals", () => {
    fc.assert(
      fc.property(fullSignalsArb, (signals) => {
        const result = classifyTask(signals, undefined, brownfieldTouchingModules);
        expect(result.tier).toBe("full");
      }),
      { numRuns: 200 },
    );
  });

  it("brownfield boost does not affect standard signals", () => {
    fc.assert(
      fc.property(standardSignalsArb, (signals) => {
        const result = classifyTask(signals, undefined, brownfieldTouchingModules);
        expect(result.tier).toBe("standard");
      }),
      { numRuns: 200 },
    );
  });

  it("user override still wins over brownfield boost", () => {
    fc.assert(
      fc.property(lightSignalsArb, (signals) => {
        const result = classifyTask(signals, "light", brownfieldTouchingModules);
        expect(result.tier).toBe("light");
      }),
      { numRuns: 200 },
    );
  });

  it("no project context behaves like v1.0 (backward compatible)", () => {
    fc.assert(
      fc.property(taskSignalsArb, (signals) => {
        const withContext = classifyTask(signals, undefined, undefined);
        const without = classifyTask(signals);
        expect(withContext.tier).toBe(without.tier);
      }),
      { numRuns: 500 },
    );
  });
});
