/**
 * Property-based tests for Review subagent selection.
 *
 * Feature: agent-team-migration
 * Property 1: Review subagent selection correctness
 *
 * @module test/review-subagent-selection.property
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildReviewSubagents } from "../src/review.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const reviewContextArb = fc.record({
  hasSpec: fc.boolean(),
  specPath: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  changedFiles: fc.array(fc.string({ minLength: 1, maxLength: 80 }), { maxLength: 10 }),
});

// ---------------------------------------------------------------------------
// Property 1: Review subagent selection correctness
// ---------------------------------------------------------------------------

describe("Feature: agent-team-migration, Property 1: review subagent selection correctness", () => {
  it("always includes quality-check and security-check; includes spec-check iff hasSpec", () => {
    fc.assert(
      fc.property(reviewContextArb, (context) => {
        const invocations = buildReviewSubagents(context);
        const agentTypes = invocations.map((inv) => inv.agentType);

        // quality-check and security-check are always present
        expect(agentTypes).toContain("quality-check");
        expect(agentTypes).toContain("security-check");

        // spec-check is present iff hasSpec is true
        if (context.hasSpec) {
          expect(agentTypes).toContain("spec-check");
        } else {
          expect(agentTypes).not.toContain("spec-check");
        }

        // When hasSpec is true, there should be exactly 3 subagents
        // When hasSpec is false, there should be exactly 2 subagents
        const expectedCount = context.hasSpec ? 3 : 2;
        expect(invocations).toHaveLength(expectedCount);
      }),
      { numRuns: 40 },
    );
  });

  it("every invocation has valid protocol fields", () => {
    fc.assert(
      fc.property(reviewContextArb, (context) => {
        const invocations = buildReviewSubagents(context);

        for (const inv of invocations) {
          expect(inv.prompt.length).toBeGreaterThan(0);
          expect(["default", "acceptEdits"]).toContain(inv.permissionMode);
          expect(inv.maxTurns).toBeGreaterThan(0);
        }
      }),
      { numRuns: 40 },
    );
  });
});
