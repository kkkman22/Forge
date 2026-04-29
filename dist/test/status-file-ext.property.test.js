/**
 * Property-based tests for the status-file-ext module.
 *
 * Covers:
 *   - Property 3: LoopStatusFields 往返一致性
 *   - Property 4: writeLoopFields 保留非 Loop 字段
 *   - Property 9: StatusFile Loop 字段 round-trip
 *   - Property 10: StatusFile Loop 字段清除完整性
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 13.2, 13.3, 13.5**
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
// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 4: writeLoopFields preserves non-Loop fields
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 4: writeLoopFields preserves non-Loop fields", () => {
    /**
     * **Validates: Requirements 13.5**
     *
     * For any valid StatusFile content containing arbitrary non-Loop
     * frontmatter fields, calling writeLoopFields() shall preserve all
     * non-Loop fields unchanged in the output. We verify this by extracting
     * non-Loop lines from the original and the written content and asserting
     * they are identical.
     */
    it("all non-Loop frontmatter fields are preserved after writeLoopFields()", () => {
        fc.assert(fc.property(statusFileArb, loopStatusFieldsArb, (content, fields) => {
            const written = writeLoopFields(content, fields);
            // Extract non-Loop frontmatter lines from original
            const originalMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (!originalMatch)
                return;
            const originalNonLoopLines = originalMatch[1]
                .split("\n")
                .filter((line) => line.trim() !== "" &&
                !line.startsWith("mode:") &&
                !line.startsWith("loop_run_id:") &&
                !line.startsWith("loop_iteration:") &&
                !line.startsWith("skill_sequence:"));
            // Extract non-Loop frontmatter lines from written
            const writtenMatch = written.match(/^---\n([\s\S]*?)\n---/);
            expect(writtenMatch).not.toBeNull();
            const writtenNonLoopLines = writtenMatch?.[1]
                .split("\n")
                .filter((line) => line.trim() !== "" &&
                !line.startsWith("mode:") &&
                !line.startsWith("loop_run_id:") &&
                !line.startsWith("loop_iteration:") &&
                !line.startsWith("skill_sequence:"));
            // Every original non-Loop field must be present and unchanged
            expect(writtenNonLoopLines).toEqual(originalNonLoopLines);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 13.5**
     *
     * For StatusFile content with many diverse non-Loop fields (using
     * unique keys generated per run), writing Loop fields with various
     * combinations of defined/undefined fields shall still preserve
     * every non-Loop field.
     */
    it("non-Loop fields preserved with partial LoopStatusFields writes", () => {
        /** Generate LoopStatusFields where each field is optionally present. */
        const partialFieldsArb = fc.record({
            mode: executionModeArb,
            loopRunId: loopRunIdArb,
            loopIteration: loopIterationArb,
            skillSequence: skillSequenceArb,
        }, { requiredKeys: [] });
        fc.assert(fc.property(statusFileArb, partialFieldsArb, (content, fields) => {
            const written = writeLoopFields(content, fields);
            const originalMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (!originalMatch)
                return;
            const originalNonLoopLines = originalMatch[1]
                .split("\n")
                .filter((line) => line.trim() !== "" &&
                !line.startsWith("mode:") &&
                !line.startsWith("loop_run_id:") &&
                !line.startsWith("loop_iteration:") &&
                !line.startsWith("skill_sequence:"));
            const writtenMatch = written.match(/^---\n([\s\S]*?)\n---/);
            expect(writtenMatch).not.toBeNull();
            const writtenNonLoopLines = writtenMatch?.[1]
                .split("\n")
                .filter((line) => line.trim() !== "" &&
                !line.startsWith("mode:") &&
                !line.startsWith("loop_run_id:") &&
                !line.startsWith("loop_iteration:") &&
                !line.startsWith("skill_sequence:"));
            expect(writtenNonLoopLines).toEqual(originalNonLoopLines);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 13.5**
     *
     * Body content after the frontmatter must also be preserved unchanged
     * after writeLoopFields().
     */
    it("body content after frontmatter is preserved after writeLoopFields()", () => {
        fc.assert(fc.property(statusFileArb, loopStatusFieldsArb, (content, fields) => {
            const written = writeLoopFields(content, fields);
            // Extract body from original (everything after closing ---)
            const originalBodyMatch = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
            const writtenBodyMatch = written.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
            const originalBody = originalBodyMatch ? originalBodyMatch[1] : "";
            const writtenBody = writtenBodyMatch ? writtenBodyMatch[1] : "";
            expect(writtenBody).toBe(originalBody);
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Generators for Property 3 (UUID-based, SkillPhase-based)
// ---------------------------------------------------------------------------
/** Valid SkillPhase strings used in skill sequences. */
const skillPhaseArb = fc.constantFrom("router", "plan", "build", "review", "test", "ship", "learn", "refactor-scan", "refactor-apply", "fix-analyze", "fix-apply");
/** Arbitrary skill sequence: array of valid SkillPhase strings. */
const skillPhaseSequenceArb = fc.array(skillPhaseArb, {
    minLength: 1,
    maxLength: 8,
});
/**
 * Generate valid LoopStatusFields with UUID-based loopRunId,
 * nat-based iteration, and SkillPhase-based skill sequences.
 */
const loopStatusFieldsWithUuidArb = fc.record({
    mode: executionModeArb,
    loopRunId: fc.uuid(),
    loopIteration: fc.nat({ max: 10000 }),
    skillSequence: skillPhaseSequenceArb,
});
/**
 * Generate LoopStatusFields where each field is optionally present.
 * This tests partial field writes (some fields undefined).
 */
const partialLoopStatusFieldsArb = fc.record({
    mode: executionModeArb,
    loopRunId: fc.uuid(),
    loopIteration: fc.nat({ max: 10000 }),
    skillSequence: skillPhaseSequenceArb,
}, { requiredKeys: [] });
// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 3: LoopStatusFields round-trip consistency
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 3: LoopStatusFields round-trip consistency", () => {
    /**
     * **Validates: Requirements 6.1, 6.3, 13.2, 13.3**
     *
     * For any valid StatusFile content and any valid LoopStatusFields
     * (with UUID loopRunId, nat iteration, SkillPhase sequences),
     * writing via writeLoopFields() then extracting via extractLoopFields()
     * shall return equivalent field values.
     */
    it("extractLoopFields(writeLoopFields(content, fields)) returns equivalent field values", () => {
        fc.assert(fc.property(statusFileArb, loopStatusFieldsWithUuidArb, (content, fields) => {
            const written = writeLoopFields(content, fields);
            const extracted = extractLoopFields(written);
            expect(extracted.mode).toBe(fields.mode);
            expect(extracted.loopRunId).toBe(fields.loopRunId);
            expect(extracted.loopIteration).toBe(fields.loopIteration);
            expect(extracted.skillSequence).toEqual(fields.skillSequence);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 6.1, 6.3, 13.2, 13.3**
     *
     * For any valid StatusFile content and any valid LoopStatusFields,
     * writing via writeLoopFields() then clearing via clearLoopFields()
     * then extracting via extractLoopFields() shall return all fields
     * as undefined.
     */
    it("extractLoopFields(clearLoopFields(writeLoopFields(content, fields))) returns all fields as undefined", () => {
        fc.assert(fc.property(statusFileArb, loopStatusFieldsWithUuidArb, (content, fields) => {
            const written = writeLoopFields(content, fields);
            const cleared = clearLoopFields(written);
            const extracted = extractLoopFields(cleared);
            expect(extracted.mode).toBeUndefined();
            expect(extracted.loopRunId).toBeUndefined();
            expect(extracted.loopIteration).toBeUndefined();
            expect(extracted.skillSequence).toBeUndefined();
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 6.1, 13.2**
     *
     * For partial LoopStatusFields (some fields undefined), only the
     * defined fields should be written and extractable. Undefined fields
     * should remain absent.
     */
    it("round-trip preserves only defined fields in partial LoopStatusFields", () => {
        fc.assert(fc.property(statusFileArb, partialLoopStatusFieldsArb, (content, fields) => {
            const written = writeLoopFields(content, fields);
            const extracted = extractLoopFields(written);
            if (fields.mode !== undefined) {
                expect(extracted.mode).toBe(fields.mode);
            }
            if (fields.loopRunId !== undefined) {
                expect(extracted.loopRunId).toBe(fields.loopRunId);
            }
            if (fields.loopIteration !== undefined) {
                expect(extracted.loopIteration).toBe(fields.loopIteration);
            }
            if (fields.skillSequence !== undefined) {
                expect(extracted.skillSequence).toEqual(fields.skillSequence);
            }
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 6.3, 13.3**
     *
     * Clearing after partial writes should still result in all Loop fields
     * being undefined.
     */
    it("clear after partial write returns all fields as undefined", () => {
        fc.assert(fc.property(statusFileArb, partialLoopStatusFieldsArb, (content, fields) => {
            const written = writeLoopFields(content, fields);
            const cleared = clearLoopFields(written);
            const extracted = extractLoopFields(cleared);
            expect(extracted.mode).toBeUndefined();
            expect(extracted.loopRunId).toBeUndefined();
            expect(extracted.loopIteration).toBeUndefined();
            expect(extracted.skillSequence).toBeUndefined();
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Import updateIterationStatus for Property 11
// ---------------------------------------------------------------------------
import { updateIterationStatus } from "../src/status-file-ext.js";
// ---------------------------------------------------------------------------
// Generators for Property 11
// ---------------------------------------------------------------------------
/** Arbitrary valid SkillPhase strings (used as phase argument). */
const phaseArb = fc.constantFrom("router", "plan", "build", "review", "test", "ship", "learn", "refactor-scan", "refactor-apply", "fix-analyze", "fix-apply", "completed", "aborted");
/** Arbitrary non-negative iteration number. */
const iterationArb = fc.nat({ max: 10000 });
/**
 * Extract the `phase` field value from StatusFile frontmatter.
 * Since `extractLoopFields()` does not return `phase`, we parse it directly.
 */
function extractPhaseFromFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match)
        return undefined;
    const phaseMatch = match[1].match(/^phase:\s*"?([^"\n]*)"?\s*$/m);
    return phaseMatch ? phaseMatch[1].trim() : undefined;
}
// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 11: updateIterationStatus field update
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 11: updateIterationStatus field update", () => {
    /**
     * **Validates: Requirements 3.6, 6.2**
     *
     * For any valid StatusFile content, phase string, and iteration number,
     * calling updateIterationStatus(content, phase, iteration) then extracting
     * the `phase` and `loop_iteration` fields shall return the written values.
     */
    it("updateIterationStatus then extracting phase and loop_iteration returns written values", () => {
        fc.assert(fc.property(statusFileArb, phaseArb, iterationArb, (content, phase, iteration) => {
            const updated = updateIterationStatus(content, phase, iteration);
            // Extract loop_iteration via extractLoopFields
            const loopFields = extractLoopFields(updated);
            expect(loopFields.loopIteration).toBe(iteration);
            // Extract phase directly from frontmatter
            const extractedPhase = extractPhaseFromFrontmatter(updated);
            expect(extractedPhase).toBe(phase);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 3.6, 6.2**
     *
     * updateIterationStatus should work on content without existing frontmatter,
     * creating new frontmatter with the phase and loop_iteration fields.
     */
    it("updateIterationStatus creates frontmatter when none exists", () => {
        fc.assert(fc.property(bodyContentArb.filter((b) => !b.trimStart().startsWith("---")), phaseArb, iterationArb, (body, phase, iteration) => {
            const updated = updateIterationStatus(body, phase, iteration);
            const loopFields = extractLoopFields(updated);
            expect(loopFields.loopIteration).toBe(iteration);
            const extractedPhase = extractPhaseFromFrontmatter(updated);
            expect(extractedPhase).toBe(phase);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 3.6, 6.2**
     *
     * updateIterationStatus should preserve existing non-phase, non-loop_iteration
     * frontmatter fields.
     */
    it("updateIterationStatus preserves other frontmatter fields", () => {
        fc.assert(fc.property(statusFileArb, phaseArb, iterationArb, (content, phase, iteration) => {
            const updated = updateIterationStatus(content, phase, iteration);
            // Extract non-phase, non-loop_iteration frontmatter lines from original
            const originalMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (!originalMatch)
                return;
            const originalOtherFields = originalMatch[1]
                .split("\n")
                .filter((line) => line.trim() !== "" &&
                !line.startsWith("phase:") &&
                !line.startsWith("loop_iteration:"));
            // Extract same from updated
            const updatedMatch = updated.match(/^---\n([\s\S]*?)\n---/);
            expect(updatedMatch).not.toBeNull();
            const updatedOtherFields = updatedMatch?.[1]
                .split("\n")
                .filter((line) => line.trim() !== "" &&
                !line.startsWith("phase:") &&
                !line.startsWith("loop_iteration:"));
            expect(updatedOtherFields).toEqual(originalOtherFields);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 3.6, 6.2**
     *
     * Calling updateIterationStatus twice with different values should
     * reflect the latest values (overwrite semantics).
     */
    it("updateIterationStatus overwrites previous values", () => {
        fc.assert(fc.property(statusFileArb, phaseArb, iterationArb, phaseArb, iterationArb, (content, phase1, iter1, phase2, iter2) => {
            const first = updateIterationStatus(content, phase1, iter1);
            const second = updateIterationStatus(first, phase2, iter2);
            const loopFields = extractLoopFields(second);
            expect(loopFields.loopIteration).toBe(iter2);
            const extractedPhase = extractPhaseFromFrontmatter(second);
            expect(extractedPhase).toBe(phase2);
        }), { numRuns: 200 });
    });
});
//# sourceMappingURL=status-file-ext.property.test.js.map