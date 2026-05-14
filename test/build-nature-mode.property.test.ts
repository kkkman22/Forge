import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { getCommandSequence } from "../src/skill-scheduler.js";
import { getWorkNatureSequenceKey, type Tier, type WorkNature } from "../src/router.js";

const tierArb: fc.Arbitrary<Tier> = fc.constantFrom("light", "standard", "full");
const workNatureArb: fc.Arbitrary<WorkNature> = fc.constantFrom("feature", "refactor", "bugfix");

describe("Build Nature Mode PBT", () => {
  it("all nature × tier combinations produce valid sequence keys", () => {
    fc.assert(
      fc.property(workNatureArb, tierArb, (nature, tier) => {
        const key = getWorkNatureSequenceKey(nature, tier);
        const sequence = getCommandSequence(key);
        expect(sequence.length).toBeGreaterThan(0);
        expect(sequence[sequence.length - 1]).toMatch(/review|ship|completed|learn/);
      }),
      { numRuns: 50 },
    );
  });

  it("refactor sequences always contain review", () => {
    fc.assert(
      fc.property(tierArb, (tier) => {
        const key = getWorkNatureSequenceKey("refactor", tier);
        const sequence = getCommandSequence(key);
        expect(sequence).toContain("review");
      }),
      { numRuns: 30 },
    );
  });

  it("bugfix sequences always contain fix-apply", () => {
    fc.assert(
      fc.property(tierArb, (tier) => {
        const key = getWorkNatureSequenceKey("bugfix", tier);
        const sequence = getCommandSequence(key);
        expect(sequence).toContain("fix-apply");
      }),
      { numRuns: 30 },
    );
  });

  it("feature sequences contain no refactor/fix-specific phases", () => {
    fc.assert(
      fc.property(tierArb, (tier) => {
        const key = getWorkNatureSequenceKey("feature", tier);
        const sequence = getCommandSequence(key);
        const naturePhases = ["refactor-scan", "refactor-apply", "fix-analyze", "fix-apply"];
        for (const phase of naturePhases) {
          expect(sequence).not.toContain(phase);
        }
      }),
      { numRuns: 30 },
    );
  });

  it("sequence key and getCommandSequence are consistent", () => {
    fc.assert(
      fc.property(workNatureArb, tierArb, (nature, tier) => {
        const key = getWorkNatureSequenceKey(nature, tier);
        const sequence = getCommandSequence(key);
        expect(sequence.length).toBeGreaterThan(0);
        // Every phase in the sequence is a valid string
        for (const phase of sequence) {
          expect(typeof phase).toBe("string");
          expect(phase.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 50 },
    );
  });

  it("refactor standard sequence includes scan and apply", () => {
    const key = getWorkNatureSequenceKey("refactor", "standard");
    const sequence = getCommandSequence(key);
    expect(sequence).toContain("refactor-scan");
    expect(sequence).toContain("refactor-apply");
  });

  it("bugfix standard sequence includes analyze and apply", () => {
    const key = getWorkNatureSequenceKey("bugfix", "standard");
    const sequence = getCommandSequence(key);
    expect(sequence).toContain("fix-analyze");
    expect(sequence).toContain("fix-apply");
  });

  it("refactor light sequence skips scan", () => {
    const key = getWorkNatureSequenceKey("refactor", "light");
    const sequence = getCommandSequence(key);
    expect(sequence).not.toContain("refactor-scan");
    expect(sequence).toContain("refactor-apply");
  });

  it("bugfix light sequence skips analyze", () => {
    const key = getWorkNatureSequenceKey("bugfix", "light");
    const sequence = getCommandSequence(key);
    expect(sequence).not.toContain("fix-analyze");
    expect(sequence).toContain("fix-apply");
  });
});
