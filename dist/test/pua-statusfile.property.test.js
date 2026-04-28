/**
 * Property-based tests for PUA StatusFile extension fields.
 *
 * Covers:
 *   - Property 11: PUA StatusFile 字段 round-trip
 *   - Property 12: PUA StatusFile 字段清除完整性
 *   - Property 13: PUA StatusFile 解析容错性
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.8**
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { clearPuaFields, extractPuaFields, writePuaFields, } from "../src/status-file-ext.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Arbitrary alphanumeric string (no newlines, no quotes, no ---). */
const _alphanumericArb = fc
    .stringMatching(/^[a-zA-Z0-9]+$/)
    .filter((s) => s.length > 0 && s.length <= 30);
/** Arbitrary YAML field key (simple alphanumeric + underscore, not a PUA or Loop field). */
const yamlKeyArb = fc
    .stringMatching(/^[a-z][a-z0-9_]{0,15}$/)
    .filter((s) => !s.startsWith("pua_") &&
    s !== "mode" &&
    s !== "loop_run_id" &&
    s !== "loop_iteration" &&
    s !== "skill_sequence" &&
    s !== "phase");
/** Arbitrary single-line YAML field value (no newlines, no `---`, no quotes). */
const yamlValueArb = fc
    .string({ minLength: 1, maxLength: 40 })
    .filter((s) => !s.includes("\n") && !s.includes("\r") && !s.includes("---") && !s.includes('"'))
    .filter((s) => s.trim().length > 0);
/** Arbitrary single YAML frontmatter field line (non-PUA key: "value"). */
const yamlFieldArb = fc.tuple(yamlKeyArb, yamlValueArb).map(([key, value]) => `${key}: "${value}"`);
/** Arbitrary body content (multi-line text after frontmatter). */
const bodyContentArb = fc
    .array(fc.string({ minLength: 0, maxLength: 60 }).filter((s) => !s.includes("---")), { minLength: 0, maxLength: 5 })
    .map((lines) => lines.join("\n"));
/**
 * Generate valid StatusFile content with YAML frontmatter containing
 * non-PUA fields to verify preservation.
 */
const statusFileArb = fc
    .tuple(fc.array(yamlFieldArb, { minLength: 1, maxLength: 5 }), bodyContentArb)
    .map(([fields, body]) => {
    const fm = fields.join("\n");
    return `---\n${fm}\n---\n${body}`;
});
/** Arbitrary valid PressureLevel value. */
const pressureLevelArb = fc.constantFrom("L0", "L1", "L2", "L3", "L4");
/** Arbitrary methodology string (valid methodology identifiers). */
const methodologyArb = fc.constantFrom("huawei-rca", "musk-algorithm", "baidu-search", "amazon-backwards", "bytedance-ab", "alibaba-closure", "netflix-keeper", "jobs-a-player");
/** Arbitrary chain index (non-negative integer). */
const chainIndexArb = fc.nat({ max: 20 });
/** Arbitrary failure pattern string (valid failure pattern identifiers). */
const failurePatternArb = fc.constantFrom("spinning", "giving-up", "low-quality", "guessing", "passive-waiting", "empty-claim");
/**
 * Generate valid PuaStatusFields with all fields populated.
 */
const puaStatusFieldsArb = fc.record({
    puaPressureLevel: pressureLevelArb,
    puaMethodology: methodologyArb,
    puaChainIndex: chainIndexArb,
    puaFailurePattern: failurePatternArb,
});
/**
 * Generate StatusFile content that already contains PUA fields
 * (used for Property 12 — clearing).
 */
const statusFileWithPuaFieldsArb = fc
    .tuple(statusFileArb, puaStatusFieldsArb)
    .map(([content, fields]) => writePuaFields(content, fields));
// ---------------------------------------------------------------------------
// Feature: pua-quality-engine, Property 11: PUA StatusFile 字段 round-trip
// ---------------------------------------------------------------------------
describe("Feature: pua-quality-engine, Property 11: PUA StatusFile 字段 round-trip", () => {
    /**
     * **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
     *
     * For any valid PuaStatusFields (containing puaPressureLevel,
     * puaMethodology, puaChainIndex, puaFailurePattern), calling
     * writePuaFields(content, fields) then extractPuaFields(result)
     * should return a semantically equivalent object.
     */
    it("writePuaFields then extractPuaFields returns semantically equivalent fields", () => {
        fc.assert(fc.property(statusFileArb, puaStatusFieldsArb, (content, fields) => {
            const written = writePuaFields(content, fields);
            const extracted = extractPuaFields(written);
            expect(extracted.puaPressureLevel).toBe(fields.puaPressureLevel);
            expect(extracted.puaMethodology).toBe(fields.puaMethodology);
            expect(extracted.puaChainIndex).toBe(fields.puaChainIndex);
            expect(extracted.puaFailurePattern).toBe(fields.puaFailurePattern);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
     *
     * Writing PUA fields should preserve other non-PUA frontmatter fields.
     */
    it("writePuaFields preserves other frontmatter fields", () => {
        fc.assert(fc.property(statusFileArb, puaStatusFieldsArb, (content, fields) => {
            const written = writePuaFields(content, fields);
            // Extract non-PUA frontmatter lines from original
            const originalMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (!originalMatch)
                return;
            const originalFields = originalMatch[1]
                .split("\n")
                .filter((line) => line.trim() !== "" && !/^pua_\w+:\s/.test(line));
            // Extract non-PUA frontmatter lines from written
            const writtenMatch = written.match(/^---\n([\s\S]*?)\n---/);
            expect(writtenMatch).not.toBeNull();
            const writtenFields = writtenMatch?.[1]
                .split("\n")
                .filter((line) => line.trim() !== "" && !/^pua_\w+:\s/.test(line));
            expect(writtenFields).toEqual(originalFields);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
     *
     * Writing PUA fields twice (idempotency): writing the same fields again
     * should produce the same extraction result.
     */
    it("writePuaFields is idempotent for the same fields", () => {
        fc.assert(fc.property(statusFileArb, puaStatusFieldsArb, (content, fields) => {
            const written1 = writePuaFields(content, fields);
            const written2 = writePuaFields(written1, fields);
            const extracted1 = extractPuaFields(written1);
            const extracted2 = extractPuaFields(written2);
            expect(extracted2.puaPressureLevel).toBe(extracted1.puaPressureLevel);
            expect(extracted2.puaMethodology).toBe(extracted1.puaMethodology);
            expect(extracted2.puaChainIndex).toBe(extracted1.puaChainIndex);
            expect(extracted2.puaFailurePattern).toBe(extracted1.puaFailurePattern);
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: pua-quality-engine, Property 12: PUA StatusFile 字段清除完整性
// ---------------------------------------------------------------------------
describe("Feature: pua-quality-engine, Property 12: PUA StatusFile 字段清除完整性", () => {
    /**
     * **Validates: Requirements 9.5, 9.6**
     *
     * For any StatusFile content containing PUA fields, calling
     * clearPuaFields() then extractPuaFields() should return all fields
     * as undefined.
     */
    it("clearPuaFields then extractPuaFields returns all fields as undefined", () => {
        fc.assert(fc.property(statusFileWithPuaFieldsArb, (contentWithFields) => {
            const cleared = clearPuaFields(contentWithFields);
            const extracted = extractPuaFields(cleared);
            expect(extracted.puaPressureLevel).toBeUndefined();
            expect(extracted.puaMethodology).toBeUndefined();
            expect(extracted.puaChainIndex).toBeUndefined();
            expect(extracted.puaFailurePattern).toBeUndefined();
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 9.5, 9.6**
     *
     * Clearing PUA fields should preserve other non-PUA frontmatter fields.
     */
    it("clearPuaFields preserves other frontmatter fields", () => {
        fc.assert(fc.property(statusFileArb, puaStatusFieldsArb, (content, fields) => {
            const withFields = writePuaFields(content, fields);
            const cleared = clearPuaFields(withFields);
            // Extract non-PUA frontmatter lines from original
            const originalMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (!originalMatch)
                return;
            const originalNonPuaFields = originalMatch[1]
                .split("\n")
                .filter((line) => line.trim() !== "" && !/^pua_\w+:\s/.test(line));
            // Extract non-PUA frontmatter lines from cleared
            const clearedMatch = cleared.match(/^---\n([\s\S]*?)\n---/);
            expect(clearedMatch).not.toBeNull();
            const clearedNonPuaFields = clearedMatch?.[1]
                .split("\n")
                .filter((line) => line.trim() !== "" && !/^pua_\w+:\s/.test(line));
            expect(clearedNonPuaFields).toEqual(originalNonPuaFields);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 9.5, 9.6**
     *
     * Clearing PUA fields is idempotent: clearing twice should produce
     * the same result as clearing once.
     */
    it("clearPuaFields is idempotent", () => {
        fc.assert(fc.property(statusFileWithPuaFieldsArb, (contentWithFields) => {
            const cleared1 = clearPuaFields(contentWithFields);
            const cleared2 = clearPuaFields(cleared1);
            expect(cleared2).toBe(cleared1);
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: pua-quality-engine, Property 13: PUA StatusFile 解析容错性
// ---------------------------------------------------------------------------
describe("Feature: pua-quality-engine, Property 13: PUA StatusFile 解析容错性", () => {
    /**
     * **Validates: Requirements 9.8**
     *
     * For any string (including empty string, invalid YAML, corrupted content),
     * extractPuaFields() should NOT throw and should return default values
     * (all fields undefined).
     */
    it("extractPuaFields never throws for arbitrary string input", () => {
        fc.assert(fc.property(fc.string(), (arbitraryInput) => {
            const result = extractPuaFields(arbitraryInput);
            // Should not throw — if we got here, it didn't throw
            expect(result).toBeDefined();
            expect(typeof result).toBe("object");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 9.8**
     *
     * For arbitrary strings that are NOT valid StatusFile content with PUA fields,
     * extractPuaFields() should return all fields as undefined.
     */
    it("extractPuaFields returns all undefined for non-StatusFile strings", () => {
        fc.assert(fc.property(fc.string().filter((s) => !s.startsWith("---")), (arbitraryInput) => {
            const result = extractPuaFields(arbitraryInput);
            expect(result.puaPressureLevel).toBeUndefined();
            expect(result.puaMethodology).toBeUndefined();
            expect(result.puaChainIndex).toBeUndefined();
            expect(result.puaFailurePattern).toBeUndefined();
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 9.8**
     *
     * Empty string input should return default values without throwing.
     */
    it("extractPuaFields returns defaults for empty string", () => {
        const result = extractPuaFields("");
        expect(result.puaPressureLevel).toBeUndefined();
        expect(result.puaMethodology).toBeUndefined();
        expect(result.puaChainIndex).toBeUndefined();
        expect(result.puaFailurePattern).toBeUndefined();
    });
});
//# sourceMappingURL=pua-statusfile.property.test.js.map