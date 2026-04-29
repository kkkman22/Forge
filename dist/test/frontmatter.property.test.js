/**
 * Property-based tests for the unified frontmatter parsing module.
 *
 * Covers:
 *   - Property 9: Frontmatter round-trip preserves fields
 *   - Property 8: Frontmatter parsing is consistent across modules
 *
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
 *
 * Feature: audit-remediation-v221, Property 3: Frontmatter field extraction regex safety
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { extractListField, extractNumericField, extractStringField, parseFrontmatter, } from "../src/frontmatter.js";
// We also import the modules that consume parseFrontmatter to verify consistency
import { parseHandoff } from "../src/handoff.js";
import { evaluateReviewGate } from "../src/quality-gate.js";
import { extractFrontmatterStatus, hasYamlFrontmatter } from "../src/state.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Generate a valid YAML field name (simple alphanumeric + underscore). */
const fieldNameArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/).filter((s) => s.length >= 1);
/** Generate a simple string value (no quotes, no newlines, no ---). */
const simpleStringValueArb = fc
    .string({ minLength: 1, maxLength: 30 })
    .filter((s) => s.trim().length > 0)
    .filter((s) => !s.includes("\n"))
    .filter((s) => !s.includes("---"))
    .filter((s) => !s.includes('"'))
    .map((s) => s.trim());
/** Generate a numeric value suitable for frontmatter. */
const numericValueArb = fc.oneof(fc.integer({ min: -1000, max: 1000 }), fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }));
/** Generate a set of string fields as key-value pairs. */
const stringFieldsArb = fc
    .array(fc.tuple(fieldNameArb, simpleStringValueArb), { minLength: 1, maxLength: 5 })
    .map((pairs) => {
    // Deduplicate field names
    const seen = new Set();
    return pairs.filter(([key]) => {
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
});
/** Generate a set of numeric fields as key-value pairs. */
const numericFieldsArb = fc
    .array(fc.tuple(fieldNameArb, numericValueArb), { minLength: 1, maxLength: 5 })
    .map((pairs) => {
    const seen = new Set();
    return pairs.filter(([key]) => {
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
});
/**
 * Build a frontmatter content string from string and numeric fields.
 * Returns the full content (with --- delimiters) and the field maps.
 */
function buildFrontmatterContent(stringFields, numericFields, body) {
    const lines = ["---"];
    for (const [key, value] of stringFields) {
        lines.push(`${key}: ${value}`);
    }
    for (const [key, value] of numericFields) {
        lines.push(`${key}: ${value}`);
    }
    lines.push("---");
    if (body) {
        lines.push(body);
    }
    return lines.join("\n");
}
/** Generate body content that doesn't interfere with frontmatter parsing. */
const bodyArb = fc
    .string({ minLength: 0, maxLength: 50 })
    .filter((s) => !s.trimStart().startsWith("---"));
/** Generate arbitrary string content for cross-module consistency testing. */
const arbitraryContentArb = fc.oneof(
// Valid frontmatter
fc
    .tuple(stringFieldsArb, numericFieldsArb, bodyArb)
    .map(([sf, nf, body]) => buildFrontmatterContent(sf, nf, body)), 
// No frontmatter
fc.string({ minLength: 0, maxLength: 100 }).filter((s) => !s.trimStart().startsWith("---")), 
// Unclosed frontmatter
fc.tuple(fieldNameArb, simpleStringValueArb).map(([k, v]) => `---\n${k}: ${v}`), 
// Empty string
fc.constant(""), 
// Just delimiters
fc.constant("---\n---"), 
// Frontmatter with empty body
fc.tuple(fieldNameArb, simpleStringValueArb).map(([k, v]) => `---\n${k}: ${v}\n---\n`));
// ---------------------------------------------------------------------------
// Feature: forge-audit-remediation, Property 9: Frontmatter round-trip
// ---------------------------------------------------------------------------
describe("Feature: forge-audit-remediation, Property 9: Frontmatter round-trip preserves fields", () => {
    /**
     * **Validates: Requirements 6.4**
     *
     * For any valid frontmatter with string fields, parsing the frontmatter,
     * extracting field values, reconstructing the frontmatter with those values,
     * and parsing again produces identical field values.
     */
    it("round-trip preserves string field values", () => {
        fc.assert(fc.property(stringFieldsArb, bodyArb, (fields, body) => {
            // Build original content
            const content = buildFrontmatterContent(fields, [], body);
            // Parse
            const parsed = parseFrontmatter(content);
            expect(parsed).not.toBeNull();
            const p = parsed;
            // Extract all string fields
            const extracted = [];
            for (const [key] of fields) {
                const value = extractStringField(p.raw, key);
                expect(value).not.toBeNull();
                extracted.push([key, value]);
            }
            // Rebuild frontmatter with extracted values
            const rebuiltContent = buildFrontmatterContent(extracted, [], body);
            // Parse again
            const reparsed = parseFrontmatter(rebuiltContent);
            expect(reparsed).not.toBeNull();
            const rp = reparsed;
            // Verify all fields match
            for (const [key, originalValue] of fields) {
                const originalExtracted = extractStringField(p.raw, key);
                const rebuiltExtracted = extractStringField(rp.raw, key);
                expect(rebuiltExtracted).toBe(originalExtracted);
                expect(rebuiltExtracted).toBe(originalValue);
            }
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 6.4**
     *
     * For any valid frontmatter with numeric fields, round-trip preserves values.
     */
    it("round-trip preserves numeric field values", () => {
        fc.assert(fc.property(numericFieldsArb, bodyArb, (fields, body) => {
            // Build original content
            const content = buildFrontmatterContent([], fields, body);
            // Parse
            const parsed = parseFrontmatter(content);
            expect(parsed).not.toBeNull();
            const p = parsed;
            // Extract all numeric fields
            const extracted = [];
            for (const [key] of fields) {
                const value = extractNumericField(p.raw, key);
                expect(value).not.toBeNull();
                extracted.push([key, value]);
            }
            // Rebuild frontmatter with extracted values
            const rebuiltContent = buildFrontmatterContent([], extracted, body);
            // Parse again
            const reparsed = parseFrontmatter(rebuiltContent);
            expect(reparsed).not.toBeNull();
            const rp = reparsed;
            // Verify all fields match
            for (const [key] of fields) {
                const originalExtracted = extractNumericField(p.raw, key);
                const rebuiltExtracted = extractNumericField(rp.raw, key);
                expect(rebuiltExtracted).toBe(originalExtracted);
            }
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 6.4**
     *
     * Round-trip preserves mixed string and numeric fields together.
     */
    it("round-trip preserves mixed string and numeric fields", () => {
        fc.assert(fc.property(stringFieldsArb, numericFieldsArb, bodyArb, (sFields, nFields, body) => {
            // Ensure no field name collisions between string and numeric fields
            const sNames = new Set(sFields.map(([k]) => k));
            const filteredNFields = nFields.filter(([k]) => !sNames.has(k));
            if (filteredNFields.length === 0)
                return; // skip if all collide
            const content = buildFrontmatterContent(sFields, filteredNFields, body);
            // Parse
            const parsed = parseFrontmatter(content);
            expect(parsed).not.toBeNull();
            const p = parsed;
            // Extract and rebuild
            const extractedStrings = [];
            for (const [key] of sFields) {
                const value = extractStringField(p.raw, key);
                expect(value).not.toBeNull();
                extractedStrings.push([key, value]);
            }
            const extractedNums = [];
            for (const [key] of filteredNFields) {
                const value = extractNumericField(p.raw, key);
                expect(value).not.toBeNull();
                extractedNums.push([key, value]);
            }
            const rebuiltContent = buildFrontmatterContent(extractedStrings, extractedNums, body);
            // Parse again and verify
            const reparsed = parseFrontmatter(rebuiltContent);
            expect(reparsed).not.toBeNull();
            const rp = reparsed;
            for (const [key] of sFields) {
                expect(extractStringField(rp.raw, key)).toBe(extractStringField(p.raw, key));
            }
            for (const [key] of filteredNFields) {
                expect(extractNumericField(rp.raw, key)).toBe(extractNumericField(p.raw, key));
            }
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: forge-audit-remediation, Property 8: Cross-module consistency
// ---------------------------------------------------------------------------
describe("Feature: forge-audit-remediation, Property 8: Frontmatter parsing is consistent across modules", () => {
    /**
     * **Validates: Requirements 6.2**
     *
     * For any string content, all modules using parseFrontmatter produce the
     * same result. Since all modules now import from the same frontmatter.ts,
     * we verify that the shared function is used consistently by checking that
     * parseFrontmatter's null/non-null result aligns with each module's behavior.
     */
    it("parseFrontmatter result is consistent with quality-gate module behavior", () => {
        fc.assert(fc.property(arbitraryContentArb, (content) => {
            const parsed = parseFrontmatter(content);
            // quality-gate: if parseFrontmatter returns null, evaluateReviewGate returns "skipped"
            const reviewResult = evaluateReviewGate(content);
            if (parsed === null) {
                expect(reviewResult.status).toBe("skipped");
            }
            // If parsed is non-null but has no p0/p1 fields, it should also be skipped
            // (this is quality-gate specific logic, not frontmatter parsing)
        }), { numRuns: 200 });
    });
    it("parseFrontmatter result is consistent with state module behavior", () => {
        fc.assert(fc.property(arbitraryContentArb, (content) => {
            const parsed = parseFrontmatter(content);
            // state: hasYamlFrontmatter should agree with parseFrontmatter
            const hasFm = hasYamlFrontmatter(content);
            expect(hasFm).toBe(parsed !== null);
            // state: extractFrontmatterStatus returns null when no frontmatter
            const status = extractFrontmatterStatus(content);
            if (parsed === null) {
                expect(status).toBeNull();
            }
        }), { numRuns: 200 });
    });
    it("parseFrontmatter result is consistent with handoff module behavior", () => {
        fc.assert(fc.property(arbitraryContentArb, (content) => {
            const parsed = parseFrontmatter(content);
            // handoff: parseHandoff returns null when no frontmatter
            const handoff = parseHandoff(content);
            if (parsed === null) {
                expect(handoff).toBeNull();
            }
            // If parsed is non-null but missing from/to/created fields, handoff also returns null
            // (this is handoff-specific validation, not frontmatter parsing)
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 6.1**
     *
     * For any content with valid frontmatter containing a status field,
     * extractFrontmatterStatus and direct parseFrontmatter + extractStringField
     * produce the same result.
     */
    it("extractFrontmatterStatus matches parseFrontmatter + extractStringField", () => {
        fc.assert(fc.property(fc.constantFrom("draft", "locked", "approved", "active", "completed"), bodyArb, (statusValue, body) => {
            const content = `---\nstatus: ${statusValue}\n---\n${body}`;
            // Direct call
            const directStatus = extractFrontmatterStatus(content);
            // Manual equivalent
            const parsed = parseFrontmatter(content);
            expect(parsed).not.toBeNull();
            const raw = parsed ? parsed.raw : "";
            const manualStatus = extractStringField(raw, "status");
            expect(directStatus).toBe(manualStatus);
            expect(directStatus).toBe(statusValue);
        }), { numRuns: 100 });
    });
});
// ---------------------------------------------------------------------------
// Feature: audit-remediation-v221, Property 3: Frontmatter field extraction regex safety
// ---------------------------------------------------------------------------
/**
 * Generators for regex-hostile field names.
 */
const regexSpecialCharsArb = fc
    .array(fc.constantFrom(".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"), {
    minLength: 1,
    maxLength: 20,
})
    .map((chars) => chars.join(""));
const generalStringFieldNameArb = fc.string({ minLength: 1, maxLength: 30 });
describe("Feature: audit-remediation-v221, Property 3: Frontmatter field extraction regex safety", () => {
    /**
     * **Validates: Requirements 7.1, 7.2**
     *
     * For any string used as fieldName (including regex special characters),
     * calling extractStringField shall never throw a SyntaxError or RegExp
     * construction error.
     */
    it("extractStringField never throws for arbitrary fieldName strings", () => {
        fc.assert(fc.property(fc.string(), (fieldName) => {
            const frontmatter = "status: draft\ntitle: hello";
            expect(() => extractStringField(frontmatter, fieldName)).not.toThrow();
        }), { numRuns: 200 });
    });
    it("extractStringField never throws for regex-special-char fieldNames", () => {
        fc.assert(fc.property(regexSpecialCharsArb, (fieldName) => {
            const frontmatter = "status: draft\ntitle: hello";
            expect(() => extractStringField(frontmatter, fieldName)).not.toThrow();
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 7.1, 7.2**
     *
     * For any string used as fieldName (including regex special characters),
     * calling extractListField shall never throw a SyntaxError or RegExp
     * construction error.
     */
    it("extractListField never throws for arbitrary fieldName strings", () => {
        fc.assert(fc.property(fc.string(), (fieldName) => {
            const frontmatter = "tags:\n  - a\n  - b";
            expect(() => extractListField(frontmatter, fieldName)).not.toThrow();
        }), { numRuns: 200 });
    });
    it("extractListField never throws for regex-special-char fieldNames", () => {
        fc.assert(fc.property(regexSpecialCharsArb, (fieldName) => {
            const frontmatter = "tags:\n  - a\n  - b";
            expect(() => extractListField(frontmatter, fieldName)).not.toThrow();
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 7.1, 7.2**
     *
     * For any string used as fieldName (including regex special characters),
     * calling extractNumericField shall never throw a SyntaxError or RegExp
     * construction error.
     */
    it("extractNumericField never throws for arbitrary fieldName strings", () => {
        fc.assert(fc.property(fc.string(), (fieldName) => {
            const frontmatter = "count: 42\nversion: 1.5";
            expect(() => extractNumericField(frontmatter, fieldName)).not.toThrow();
        }), { numRuns: 200 });
    });
    it("extractNumericField never throws for regex-special-char fieldNames", () => {
        fc.assert(fc.property(regexSpecialCharsArb, (fieldName) => {
            const frontmatter = "count: 42\nversion: 1.5";
            expect(() => extractNumericField(frontmatter, fieldName)).not.toThrow();
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 7.1, 7.2**
     *
     * Combined test: for any general string fieldName, all three extraction
     * functions return either a valid result or null — never throw.
     */
    it("all extraction functions return result or null for general string fieldNames", () => {
        fc.assert(fc.property(generalStringFieldNameArb, (fieldName) => {
            const frontmatter = "status: draft\ncount: 42\ntags:\n  - a\n  - b";
            const strResult = extractStringField(frontmatter, fieldName);
            expect(strResult === null || typeof strResult === "string").toBe(true);
            const numResult = extractNumericField(frontmatter, fieldName);
            expect(numResult === null || typeof numResult === "number").toBe(true);
            const listResult = extractListField(frontmatter, fieldName);
            expect(Array.isArray(listResult)).toBe(true);
        }), { numRuns: 200 });
    });
});
//# sourceMappingURL=frontmatter.property.test.js.map