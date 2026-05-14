/**
 * Unit tests for the agent-output extension (Skill-aware fields).
 *
 * Tests specific concrete examples for skill_phase_completed, gate_result,
 * next_skill_phase values, backward compatibility, and validation failures.
 *
 * **Validates: Requirements 9.4, 9.5**
 */
import { describe, expect, it } from "vitest";
import { buildAgentOutputSchema, validateAgentOutput } from "../src/agent-output.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Minimal valid AgentOutput (old format, no skill fields). */
function baseOutput() {
    return {
        success: true,
        summary: "Completed iteration",
        key_changes_made: ["added foo.ts"],
        key_learnings: ["use strict mode"],
    };
}
// ---------------------------------------------------------------------------
// Validates: Requirement 9.4 — skill_phase_completed concrete values
// ---------------------------------------------------------------------------
describe("skill_phase_completed validation", () => {
    it.each([
        "build",
        "review",
        "test",
        "plan",
        "router",
        "ship",
        "learn",
    ])('accepts skill_phase_completed = "%s"', (phase) => {
        const result = validateAgentOutput({
            ...baseOutput(),
            skill_phase_completed: phase,
        });
        expect(result.valid).toBe(true);
    });
    it("rejects non-string skill_phase_completed (number)", () => {
        const result = validateAgentOutput({
            ...baseOutput(),
            skill_phase_completed: 42,
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain("skill_phase_completed must be a string");
        }
    });
    it("rejects non-string skill_phase_completed (boolean)", () => {
        const result = validateAgentOutput({
            ...baseOutput(),
            skill_phase_completed: true,
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain("skill_phase_completed must be a string");
        }
    });
    it("rejects non-string skill_phase_completed (array)", () => {
        const result = validateAgentOutput({
            ...baseOutput(),
            skill_phase_completed: ["build"],
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain("skill_phase_completed must be a string");
        }
    });
});
// ---------------------------------------------------------------------------
// Validates: Requirement 9.5 — gate_result concrete values
// ---------------------------------------------------------------------------
describe("gate_result validation", () => {
    it('accepts gate_result = "passed"', () => {
        const result = validateAgentOutput({
            ...baseOutput(),
            gate_result: "passed",
        });
        expect(result.valid).toBe(true);
    });
    it('accepts gate_result = "blocked"', () => {
        const result = validateAgentOutput({
            ...baseOutput(),
            gate_result: "blocked",
        });
        expect(result.valid).toBe(true);
    });
    it('accepts gate_result = "skipped"', () => {
        const result = validateAgentOutput({
            ...baseOutput(),
            gate_result: "skipped",
        });
        expect(result.valid).toBe(true);
    });
    it('rejects invalid gate_result string "failed"', () => {
        const result = validateAgentOutput({
            ...baseOutput(),
            gate_result: "failed",
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain('gate_result must be one of "passed", "blocked", "skipped"');
        }
    });
    it('rejects invalid gate_result string "unknown"', () => {
        const result = validateAgentOutput({
            ...baseOutput(),
            gate_result: "unknown",
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain('gate_result must be one of "passed", "blocked", "skipped"');
        }
    });
    it("rejects non-string gate_result (number)", () => {
        const result = validateAgentOutput({
            ...baseOutput(),
            gate_result: 1,
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain('gate_result must be one of "passed", "blocked", "skipped"');
        }
    });
    it("rejects non-string gate_result (boolean)", () => {
        const result = validateAgentOutput({
            ...baseOutput(),
            gate_result: false,
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain('gate_result must be one of "passed", "blocked", "skipped"');
        }
    });
});
// ---------------------------------------------------------------------------
// next_skill_phase validation
// ---------------------------------------------------------------------------
describe("next_skill_phase validation", () => {
    it.each([
        "build",
        "review",
        "test",
        "ship",
        "completed",
    ])('accepts next_skill_phase = "%s"', (phase) => {
        const result = validateAgentOutput({
            ...baseOutput(),
            next_skill_phase: phase,
        });
        expect(result.valid).toBe(true);
    });
    it("rejects non-string next_skill_phase (number)", () => {
        const result = validateAgentOutput({
            ...baseOutput(),
            next_skill_phase: 99,
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain("next_skill_phase must be a string");
        }
    });
    it("rejects non-string next_skill_phase (object)", () => {
        const result = validateAgentOutput({
            ...baseOutput(),
            next_skill_phase: { phase: "build" },
        });
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.errors).toContain("next_skill_phase must be a string");
        }
    });
});
// ---------------------------------------------------------------------------
// Backward compatibility — old-format AgentOutput without new fields
// ---------------------------------------------------------------------------
describe("backward compatibility", () => {
    it("validates old-format AgentOutput without any skill fields", () => {
        const result = validateAgentOutput(baseOutput());
        expect(result.valid).toBe(true);
    });
    it("validates old-format AgentOutput with should_fully_stop", () => {
        const result = validateAgentOutput({
            ...baseOutput(),
            should_fully_stop: true,
        });
        expect(result.valid).toBe(true);
    });
    it("validates full new-format AgentOutput with all skill fields", () => {
        const result = validateAgentOutput({
            ...baseOutput(),
            should_fully_stop: false,
            skill_phase_completed: "build",
            next_skill_phase: "review",
            gate_result: "passed",
        });
        expect(result.valid).toBe(true);
    });
});
// ---------------------------------------------------------------------------
// buildAgentOutputSchema — includeSkillFields behavior
// ---------------------------------------------------------------------------
describe("buildAgentOutputSchema includeSkillFields", () => {
    it("includes skill fields in properties when includeSkillFields is true", () => {
        const schema = buildAgentOutputSchema({
            includeStopField: false,
            includeSkillFields: true,
        });
        expect(schema.properties).toHaveProperty("skill_phase_completed");
        expect(schema.properties).toHaveProperty("next_skill_phase");
        expect(schema.properties).toHaveProperty("gate_result");
    });
    it("does not include skill fields in required when includeSkillFields is true", () => {
        const schema = buildAgentOutputSchema({
            includeStopField: true,
            includeSkillFields: true,
        });
        expect(schema.required).not.toContain("skill_phase_completed");
        expect(schema.required).not.toContain("next_skill_phase");
        expect(schema.required).not.toContain("gate_result");
    });
    it("omits skill fields from properties when includeSkillFields is false", () => {
        const schema = buildAgentOutputSchema({
            includeStopField: true,
            includeSkillFields: false,
        });
        expect(schema.properties).not.toHaveProperty("skill_phase_completed");
        expect(schema.properties).not.toHaveProperty("next_skill_phase");
        expect(schema.properties).not.toHaveProperty("gate_result");
    });
    it("omits skill fields from properties when includeSkillFields is omitted", () => {
        const schema = buildAgentOutputSchema({ includeStopField: false });
        expect(schema.properties).not.toHaveProperty("skill_phase_completed");
        expect(schema.properties).not.toHaveProperty("next_skill_phase");
        expect(schema.properties).not.toHaveProperty("gate_result");
    });
});
//# sourceMappingURL=agent-output-ext.test.js.map