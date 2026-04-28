/**
 * Property-based tests for the status-file-ext module.
 *
 * Covers:
 *   - Property 9: StatusFile Loop 字段 round-trip
 *   - Property 10: StatusFile Loop 字段清除完整性
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { clearLoopFields, extractLoopFields, writeLoopFields } from "../src/status-file-ext.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Arbitrary alphanumeric string (no newlines, no quotes, no ---). */
const alphanumericArb = fc
    .stringMatching(/^[a-zA-Z0-9]+$/)
    .filter((s) => s.length > 0 && s.length <= 30);
/** Arbitrary YAML field key (simple alphanumeric + underscore, not a Loop field). */
const yamlKeyArb = fc
    .stringMatching(/^[a-z][a-z0-9_]{0,15}$/)
    .filter((s) => s !== "mode" &&
    s !== "loop_run_id" &&
    s !== "loop_iteration" &&
    s !== "skill_sequence" &&
    s !== "phase");
/** Arbitrary single-line YAML field value (no newlines, no `---`, no quotes). */
const yamlValueArb = fc
    .string({ minLength: 1, maxLength: 40 })
    .filter((s) => !s.includes("\n") && !s.includes("\r") && !s.includes("---") && !s.includes('"'))
    .filter((s) => s.trim().length > 0);
/** Arbitrary single YAML frontmatter field line (non-Loop key: "value"). */
const yamlFieldArb = fc.tuple(yamlKeyArb, yamlValueArb).map(([key, value]) => `${key}: "${value}"`);
/** Arbitrary body content (multi-line text after frontmatter). */
const bodyContentArb = fc
    .array(fc.string({ minLength: 0, maxLength: 60 }).filter((s) => !s.includes("---")), { minLength: 0, maxLength: 5 })
    .map((lines) => lines.join("\n"));
/**
 * Generate valid StatusFile content with YAML frontmatter containing
 * non-Loop fields to verify preservation.
 */
const statusFileArb = fc
    .tuple(fc.array(yamlFieldArb, { minLength: 1, maxLength: 5 }), bodyContentArb)
    .map(([fields, body]) => {
    const fm = fields.join("\n");
    return `---\n${fm}\n---\n${body}`;
});
/** Arbitrary valid ExecutionMode value. */
const executionModeArb = fc.constantFrom("interactive", "autonomous");
/** Arbitrary loopRunId: alphanumeric string (no newlines, no quotes, no ---). */
const loopRunIdArb = alphanumericArb;
/** Arbitrary loopIteration: non-negative integer. */
const loopIterationArb = fc.nat({ max: 10000 });
/** Arbitrary skillSequence: array of simple alphanumeric strings (no commas, no newlines). */
const skillSequenceArb = fc.array(alphanumericArb, {
    minLength: 1,
    maxLength: 8,
});
/**
 * Generate valid LoopStatusFields with all fields populated.
 */
const loopStatusFieldsArb = fc.record({
    mode: executionModeArb,
    loopRunId: loopRunIdArb,
    loopIteration: loopIterationArb,
    skillSequence: skillSequenceArb,
});
/**
 * Generate StatusFile content that already contains Loop fields
 * (used for Property 10 — clearing).
 */
const statusFileWithLoopFieldsArb = fc
    .tuple(statusFileArb, loopStatusFieldsArb)
    .map(([content, fields]) => writeLoopFields(content, fields));
// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 9: StatusFile Loop 字段 round-trip
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 9: StatusFile Loop 字段 round-trip", () => {
    /**
     * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
     *
     * For any valid LoopStatusFields (containing mode, loopRunId,
     * loopIteration, skillSequence), calling writeLoopFields(content, fields)
     * then extractLoopFields(result) should return a semantically equivalent
     * object.
     */
    it("writeLoopFields then extractLoopFields returns semantically equivalent fields", () => {
        fc.assert(fc.property(statusFileArb, loopStatusFieldsArb, (content, fields) => {
            const written = writeLoopFields(content, fields);
            const extracted = extractLoopFields(written);
            expect(extracted.mode).toBe(fields.mode);
            expect(extracted.loopRunId).toBe(fields.loopRunId);
            expect(extracted.loopIteration).toBe(fields.loopIteration);
            expect(extracted.skillSequence).toEqual(fields.skillSequence);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
     *
     * Writing Loop fields should preserve other non-Loop frontmatter fields.
     */
    it("writeLoopFields preserves other frontmatter fields", () => {
        fc.assert(fc.property(statusFileArb, loopStatusFieldsArb, (content, fields) => {
            const written = writeLoopFields(content, fields);
            // Extract non-Loop frontmatter lines from original
            const originalMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (!originalMatch)
                return;
            const originalFields = originalMatch[1]
                .split("\n")
                .filter((line) => line.trim() !== "" &&
                !line.startsWith("mode:") &&
                !line.startsWith("loop_run_id:") &&
                !line.startsWith("loop_iteration:") &&
                !line.startsWith("skill_sequence:"));
            // Extract non-Loop frontmatter lines from written
            const writtenMatch = written.match(/^---\n([\s\S]*?)\n---/);
            expect(writtenMatch).not.toBeNull();
            const writtenFields = writtenMatch?.[1]
                .split("\n")
                .filter((line) => line.trim() !== "" &&
                !line.startsWith("mode:") &&
                !line.startsWith("loop_run_id:") &&
                !line.startsWith("loop_iteration:") &&
                !line.startsWith("skill_sequence:"));
            expect(writtenFields).toEqual(originalFields);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
     *
     * Writing Loop fields twice (idempotency): writing the same fields again
     * should produce the same extraction result.
     */
    it("writeLoopFields is idempotent for the same fields", () => {
        fc.assert(fc.property(statusFileArb, loopStatusFieldsArb, (content, fields) => {
            const written1 = writeLoopFields(content, fields);
            const written2 = writeLoopFields(written1, fields);
            const extracted1 = extractLoopFields(written1);
            const extracted2 = extractLoopFields(written2);
            expect(extracted2.mode).toBe(extracted1.mode);
            expect(extracted2.loopRunId).toBe(extracted1.loopRunId);
            expect(extracted2.loopIteration).toBe(extracted1.loopIteration);
            expect(extracted2.skillSequence).toEqual(extracted1.skillSequence);
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 10: StatusFile Loop 字段清除完整性
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 10: StatusFile Loop 字段清除完整性", () => {
    /**
     * **Validates: Requirements 6.5, 6.6**
     *
     * For any StatusFile content containing Loop fields, calling
     * clearLoopFields() then extractLoopFields() should return all fields
     * as undefined.
     */
    it("clearLoopFields then extractLoopFields returns all fields as undefined", () => {
        fc.assert(fc.property(statusFileWithLoopFieldsArb, (contentWithFields) => {
            const cleared = clearLoopFields(contentWithFields);
            const extracted = extractLoopFields(cleared);
            expect(extracted.mode).toBeUndefined();
            expect(extracted.loopRunId).toBeUndefined();
            expect(extracted.loopIteration).toBeUndefined();
            expect(extracted.skillSequence).toBeUndefined();
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 6.5, 6.6**
     *
     * Clearing Loop fields should preserve other non-Loop frontmatter fields.
     */
    it("clearLoopFields preserves other frontmatter fields", () => {
        fc.assert(fc.property(statusFileArb, loopStatusFieldsArb, (content, fields) => {
            const withFields = writeLoopFields(content, fields);
            const cleared = clearLoopFields(withFields);
            // Extract non-Loop frontmatter lines from original
            const originalMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (!originalMatch)
                return;
            const originalNonLoopFields = originalMatch[1]
                .split("\n")
                .filter((line) => line.trim() !== "" &&
                !line.startsWith("mode:") &&
                !line.startsWith("loop_run_id:") &&
                !line.startsWith("loop_iteration:") &&
                !line.startsWith("skill_sequence:"));
            // Extract non-Loop frontmatter lines from cleared
            const clearedMatch = cleared.match(/^---\n([\s\S]*?)\n---/);
            expect(clearedMatch).not.toBeNull();
            const clearedNonLoopFields = clearedMatch?.[1]
                .split("\n")
                .filter((line) => line.trim() !== "" &&
                !line.startsWith("mode:") &&
                !line.startsWith("loop_run_id:") &&
                !line.startsWith("loop_iteration:") &&
                !line.startsWith("skill_sequence:"));
            expect(clearedNonLoopFields).toEqual(originalNonLoopFields);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 6.5, 6.6**
     *
     * Clearing Loop fields is idempotent: clearing twice should produce
     * the same result as clearing once.
     */
    it("clearLoopFields is idempotent", () => {
        fc.assert(fc.property(statusFileWithLoopFieldsArb, (contentWithFields) => {
            const cleared1 = clearLoopFields(contentWithFields);
            const cleared2 = clearLoopFields(cleared1);
            expect(cleared2).toBe(cleared1);
        }), { numRuns: 200 });
    });
});
//# sourceMappingURL=status-file-ext.property.test.js.map