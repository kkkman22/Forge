/**
 * Property-based tests for the agent-output module.
 *
 * Covers:
 *   - Property 4: Schema 条件構建
 *   - Property 9: AgentOutput 验证正确性
 *   - Property 10: AgentOutput 序列化往返一致性
 *
 * **Validates: Requirements 1.7, 4.2, 4.3, 4.4, 4.7**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildAgentOutputSchema, deserializeAgentOutput, serializeAgentOutput, validateAgentOutput, } from "../src/agent-output.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Arbitrary valid AgentOutput without should_fully_stop. */
const agentOutputBaseArb = fc.record({
    success: fc.boolean(),
    summary: fc.string(),
    key_changes_made: fc.array(fc.string()),
    key_learnings: fc.array(fc.string()),
});
/** Arbitrary valid AgentOutput with optional should_fully_stop. */
const agentOutputArb = fc.oneof(agentOutputBaseArb, fc.record({
    success: fc.boolean(),
    summary: fc.string(),
    key_changes_made: fc.array(fc.string()),
    key_learnings: fc.array(fc.string()),
    should_fully_stop: fc.boolean(),
}));
/** Arbitrary objects missing one or more required fields, or with wrong types. */
const invalidAgentOutputArb = fc.oneof(
// Missing success field
fc.record({
    summary: fc.string(),
    key_changes_made: fc.array(fc.string()),
    key_learnings: fc.array(fc.string()),
}), 
// Missing summary field
fc.record({
    success: fc.boolean(),
    key_changes_made: fc.array(fc.string()),
    key_learnings: fc.array(fc.string()),
}), 
// Missing key_changes_made field
fc.record({
    success: fc.boolean(),
    summary: fc.string(),
    key_learnings: fc.array(fc.string()),
}), 
// Missing key_learnings field
fc.record({
    success: fc.boolean(),
    summary: fc.string(),
    key_changes_made: fc.array(fc.string()),
}), 
// Wrong type for success (string instead of boolean)
fc.record({
    success: fc.string(),
    summary: fc.string(),
    key_changes_made: fc.array(fc.string()),
    key_learnings: fc.array(fc.string()),
}), 
// Wrong type for summary (number instead of string)
fc.record({
    success: fc.boolean(),
    summary: fc.integer(),
    key_changes_made: fc.array(fc.string()),
    key_learnings: fc.array(fc.string()),
}), 
// Wrong type for key_changes_made (string instead of array)
fc.record({
    success: fc.boolean(),
    summary: fc.string(),
    key_changes_made: fc.string(),
    key_learnings: fc.array(fc.string()),
}), 
// Wrong type for key_learnings (number instead of array)
fc.record({
    success: fc.boolean(),
    summary: fc.string(),
    key_changes_made: fc.array(fc.string()),
    key_learnings: fc.integer(),
}));
// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 4: Schema 条件構建
// ---------------------------------------------------------------------------
describe("Feature: gnhf-inspired-enhancements, Property 4: Schema 条件構建", () => {
    const CORE_FIELDS = ["success", "summary", "key_changes_made", "key_learnings"];
    /**
     * **Validates: Requirements 1.7, 4.2, 4.3**
     */
    it("schema always contains success, summary, key_changes_made, key_learnings fields", () => {
        fc.assert(fc.property(fc.boolean(), (includeStopField) => {
            const schema = buildAgentOutputSchema({ includeStopField });
            for (const field of CORE_FIELDS) {
                expect(schema.properties).toHaveProperty(field);
            }
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 4.3**
     */
    it("additionalProperties is always false", () => {
        fc.assert(fc.property(fc.boolean(), (includeStopField) => {
            const schema = buildAgentOutputSchema({ includeStopField });
            expect(schema.additionalProperties).toBe(false);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 4.3**
     */
    it("required array covers all properties keys", () => {
        fc.assert(fc.property(fc.boolean(), (includeStopField) => {
            const schema = buildAgentOutputSchema({ includeStopField });
            const propertyKeys = Object.keys(schema.properties).sort();
            const requiredKeys = [...schema.required].sort();
            expect(requiredKeys).toEqual(propertyKeys);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 1.7, 4.2**
     */
    it("should_fully_stop appears in schema iff includeStopField is true", () => {
        fc.assert(fc.property(fc.boolean(), (includeStopField) => {
            const schema = buildAgentOutputSchema({ includeStopField });
            const hasStopField = "should_fully_stop" in schema.properties;
            expect(hasStopField).toBe(includeStopField);
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 9: AgentOutput 验证正确性
// ---------------------------------------------------------------------------
describe("Feature: gnhf-inspired-enhancements, Property 9: AgentOutput 验证正确性", () => {
    /**
     * **Validates: Requirements 4.4**
     */
    it("valid AgentOutput objects pass validation (valid: true)", () => {
        fc.assert(fc.property(agentOutputArb, (output) => {
            const result = validateAgentOutput(output);
            expect(result.valid).toBe(true);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 4.4**
     */
    it("objects missing required fields return validation errors (valid: false)", () => {
        fc.assert(fc.property(invalidAgentOutputArb, (data) => {
            const result = validateAgentOutput(data);
            expect(result.valid).toBe(false);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 4.4**
     */
    it("null and non-object values return validation errors", () => {
        const nonObjectArb = fc.oneof(fc.constant(null), fc.constant(undefined), fc.string(), fc.integer(), fc.boolean());
        fc.assert(fc.property(nonObjectArb, (data) => {
            const result = validateAgentOutput(data);
            expect(result.valid).toBe(false);
            if (!result.valid) {
                expect(result.errors.length).toBeGreaterThan(0);
            }
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: gnhf-inspired-enhancements, Property 10: AgentOutput 序列化往返一致性
// ---------------------------------------------------------------------------
describe("Feature: gnhf-inspired-enhancements, Property 10: AgentOutput 序列化往返一致性", () => {
    /**
     * **Validates: Requirements 4.7**
     */
    it("deserializeAgentOutput(serializeAgentOutput(output)) produces a valid result equal to the original", () => {
        fc.assert(fc.property(agentOutputArb, (output) => {
            const serialized = serializeAgentOutput(output);
            const result = deserializeAgentOutput(serialized);
            expect(result.valid).toBe(true);
            if (result.valid) {
                expect(result.value).toEqual(output);
            }
        }), { numRuns: 200 });
    });
});
//# sourceMappingURL=agent-output.property.test.js.map