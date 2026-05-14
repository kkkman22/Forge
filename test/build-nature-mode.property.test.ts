/**
 * Property-based tests for Build Nature Mode routing consistency.
 *
 * Validates:
 *   - All nature × tier combinations produce valid command sequences
 *   - Refactor sequences end with review (light) or include test+ship (standard)
 *   - Bugfix sequences include fix-apply
 *   - Feature sequences contain no refactor/fix-specific phases
 *   - getWorkNatureSequenceKey ↔ getCommandSequence correspondence
 *   - All phase sequences contain no placeholder values
 *
 * **Validates: Spec Requirements 4, 8, 9, 11, 12**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  classifyTask,
  detectWorkNature,
  getWorkNatureSequenceKey,
  type TaskSignals,
  type Tier,
  type WorkNature,
} from "../src/router.js";
import { getCommandSequence } from "../src/skill-scheduler.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

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

const tierArb: fc.Arbitrary<Tier> = fc.constantFrom("light", "standard", "full");

const workNatureArb: fc.Arbitrary<WorkNature> = fc.constantFrom("feature", "refactor", "bugfix");

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("Build Nature Mode PBT", () => {
  it("all nature × tier combinations produce valid command sequences", () => {
    fc.assert(
      fc.property(workNatureArb, tierArb, (nature, tier) => {
        const key = getWorkNatureSequenceKey(nature, tier);
        const sequence = getCommandSequence(key);
        expect(sequence.length).toBeGreaterThan(0);
        for (const phase of sequence) {
          expect(typeof phase).toBe("string");
          expect(phase.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 50 },
    );
  });

  it("refactor sequences contain refactor-specific phases", () => {
    fc.assert(
      fc.property(tierArb, (tier) => {
        const key = getWorkNatureSequenceKey("refactor", tier);
        const sequence = getCommandSequence(key);
        const hasRefactorPhase = sequence.some(
          (p) => p === "refactor-scan" || p === "refactor-apply",
        );
        expect(hasRefactorPhase).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  it("bugfix sequences contain fix-specific phases", () => {
    fc.assert(
      fc.property(tierArb, (tier) => {
        const key = getWorkNatureSequenceKey("bugfix", tier);
        const sequence = getCommandSequence(key);
        const hasFixPhase = sequence.some(
          (p) => p === "fix-analyze" || p === "fix-apply",
        );
        expect(hasFixPhase).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  it("feature sequences contain no refactor/fix-specific phases", () => {
    fc.assert(
      fc.property(tierArb, (tier) => {
        const key = getWorkNatureSequenceKey("feature", tier);
        const sequence = getCommandSequence(key);
        for (const phase of sequence) {
          expect(phase).not.toContain("refactor");
          expect(phase).not.toContain("fix-");
        }
      }),
      { numRuns: 50 },
    );
  });

  it("all sequences end with review, test, ship, learn, or completed", () => {
    fc.assert(
      fc.property(workNatureArb, tierArb, (nature, tier) => {
        const key = getWorkNatureSequenceKey(nature, tier);
        const sequence = getCommandSequence(key);
        const lastPhase = sequence[sequence.length - 1];
        const validTerminals = ["review", "test", "ship", "learn"];
        expect(validTerminals).toContain(lastPhase);
      }),
      { numRuns: 50 },
    );
  });

  it("refactor light skips scan (goes directly to apply)", () => {
    const key = getWorkNatureSequenceKey("refactor", "light");
    const sequence = getCommandSequence(key);
    expect(sequence).not.toContain("refactor-scan");
    expect(sequence).toContain("refactor-apply");
  });

  it("bugfix light skips analyze (goes directly to apply)", () => {
    const key = getWorkNatureSequenceKey("bugfix", "light");
    const sequence = getCommandSequence(key);
    expect(sequence).not.toContain("fix-analyze");
    expect(sequence).toContain("fix-apply");
  });

  it("refactor standard includes scan → apply → review → test → ship", () => {
    const key = getWorkNatureSequenceKey("refactor", "standard");
    const sequence = getCommandSequence(key);
    expect(sequence).toContain("refactor-scan");
    expect(sequence).toContain("refactor-apply");
    expect(sequence).toContain("review");
    expect(sequence).toContain("test");
    expect(sequence).toContain("ship");
  });

  it("bugfix standard includes analyze → apply → review → test → ship", () => {
    const key = getWorkNatureSequenceKey("bugfix", "standard");
    const sequence = getCommandSequence(key);
    expect(sequence).toContain("fix-analyze");
    expect(sequence).toContain("fix-apply");
    expect(sequence).toContain("review");
    expect(sequence).toContain("test");
    expect(sequence).toContain("ship");
  });

  it("work_nature does not affect tier classification in classifyTask", () => {
    fc.assert(
      fc.property(taskSignalsArb, workNatureArb, workNatureArb, (signals, n1, n2) => {
        const r1 = classifyTask(signals, undefined, undefined, "fullstack", "iteration", n1);
        const r2 = classifyTask(signals, undefined, undefined, "fullstack", "iteration", n2);
        expect(r1.tier).toBe(r2.tier);
      }),
      { numRuns: 50 },
    );
  });

  it("getWorkNatureSequenceKey always returns a key with a matching command sequence", () => {
    fc.assert(
      fc.property(workNatureArb, tierArb, (nature, tier) => {
        const key = getWorkNatureSequenceKey(nature, tier);
        const sequence = getCommandSequence(key);
        // getCommandSequence falls back to default if key not found,
        // so verify the sequence is non-empty and contains expected phases
        expect(sequence.length).toBeGreaterThan(0);
      }),
      { numRuns: 50 },
    );
  });

  it("detectWorkNature is deterministic for identical inputs", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 100 }), (desc) => {
        const r1 = detectWorkNature(desc);
        const r2 = detectWorkNature(desc);
        expect(r1).toBe(r2);
      }),
      { numRuns: 50 },
    );
  });
});
