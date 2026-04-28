/**
 * Property-based tests for the agent-output extension (Skill-aware fields).
 *
 * Covers:
 *   - Property 11: AgentOutput 扩展向后兼容
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.6, 12.5**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildAgentOutputSchema, validateAgentOutput } from "../src/agent-output.js";
import type { AgentOutput } from "../src/loop-types.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Arbitrary valid AgentOutput WITHOUT any skill fields (old format). */
const oldFormatAgentOutputArb: fc.Arbitrary<AgentOutput> = fc.oneof(
  fc.record({
    success: fc.boolean(),
    summary: fc.string(),
    key_changes_made: fc.array(fc.string()),
    key_learnings: fc.array(fc.string()),
  }),
  fc.record({
    success: fc.boolean(),
    summary: fc.string(),
    key_changes_made: fc.array(fc.string()),
    key_learnings: fc.array(fc.string()),
    should_fully_stop: fc.boolean(),
  }),
);

/** Valid gate_result values. */
const validGateResultArb: fc.Arbitrary<"passed" | "blocked" | "skipped"> = fc.constantFrom(
  "passed",
  "blocked",
  "skipped",
);

/** Arbitrary valid AgentOutput WITH skill fields (new format). */
const newFormatAgentOutputArb: fc.Arbitrary<AgentOutput> = fc.record(
  {
    success: fc.boolean(),
    summary: fc.string(),
    key_changes_made: fc.array(fc.string()),
    key_learnings: fc.array(fc.string()),
    should_fully_stop: fc.boolean(),
    skill_phase_completed: fc.string(),
    next_skill_phase: fc.string(),
    gate_result: validGateResultArb,
  },
  {
    requiredKeys: ["success", "summary", "key_changes_made", "key_learnings"],
  },
);

/** Arbitrary invalid gate_result values (not one of "passed", "blocked", "skipped"). */
const invalidGateResultArb: fc.Arbitrary<string> = fc
  .string({ minLength: 1 })
  .filter((s) => s !== "passed" && s !== "blocked" && s !== "skipped");

// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 11: AgentOutput 扩展向后兼容
// ---------------------------------------------------------------------------

describe("Feature: loop-skills-fusion, Property 11: AgentOutput 扩展向后兼容", () => {
  /**
   * Old-format AgentOutput objects (without skill fields) still validate.
   *
   * **Validates: Requirements 9.6, 12.5**
   */
  it("old-format AgentOutput (no skill fields) passes validation", () => {
    fc.assert(
      fc.property(oldFormatAgentOutputArb, (output) => {
        const result = validateAgentOutput(output);
        expect(result.valid).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * New-format AgentOutput objects (with valid skill fields) also validate.
   *
   * **Validates: Requirements 9.1, 9.2, 9.3**
   */
  it("new-format AgentOutput (with valid skill fields) passes validation", () => {
    fc.assert(
      fc.property(newFormatAgentOutputArb, (output) => {
        const result = validateAgentOutput(output);
        expect(result.valid).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * Invalid gate_result values cause validation failure.
   *
   * **Validates: Requirements 9.3**
   */
  it("invalid gate_result values cause validation failure", () => {
    fc.assert(
      fc.property(
        fc.record({
          success: fc.boolean(),
          summary: fc.string(),
          key_changes_made: fc.array(fc.string()),
          key_learnings: fc.array(fc.string()),
        }),
        invalidGateResultArb,
        (base, badGateResult) => {
          const output = { ...base, gate_result: badGateResult };
          const result = validateAgentOutput(output);
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * buildAgentOutputSchema with includeSkillFields=true includes skill fields
   * in properties but NOT in required.
   *
   * **Validates: Requirements 9.6**
   */
  it("buildAgentOutputSchema with includeSkillFields=true includes skill fields in properties but NOT in required", () => {
    fc.assert(
      fc.property(fc.boolean(), (includeStopField) => {
        const schema = buildAgentOutputSchema({
          includeStopField,
          includeSkillFields: true,
        });

        // Skill fields must be present in properties
        expect(schema.properties).toHaveProperty("skill_phase_completed");
        expect(schema.properties).toHaveProperty("next_skill_phase");
        expect(schema.properties).toHaveProperty("gate_result");

        // Skill fields must NOT be in required
        expect(schema.required).not.toContain("skill_phase_completed");
        expect(schema.required).not.toContain("next_skill_phase");
        expect(schema.required).not.toContain("gate_result");
      }),
      { numRuns: 200 },
    );
  });

  /**
   * buildAgentOutputSchema with includeSkillFields=false (or omitted) does NOT
   * include skill fields in properties.
   *
   * **Validates: Requirements 9.6**
   */
  it("buildAgentOutputSchema without includeSkillFields does not include skill fields", () => {
    fc.assert(
      fc.property(fc.boolean(), (includeStopField) => {
        const schema = buildAgentOutputSchema({
          includeStopField,
          includeSkillFields: false,
        });

        expect(schema.properties).not.toHaveProperty("skill_phase_completed");
        expect(schema.properties).not.toHaveProperty("next_skill_phase");
        expect(schema.properties).not.toHaveProperty("gate_result");
      }),
      { numRuns: 200 },
    );
  });
});
