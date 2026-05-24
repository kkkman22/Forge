/**
 * Feature: audit-remediation-v221, Property 1: Hooks validation correctly classifies JSON structures
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateHooksPresence } from "../src/sdk-driver.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Create a temp directory with hooks/hooks.json containing the given content string. */
function setupHooksDir(tmpDir, content) {
    const hooksDir = join(tmpDir, "hooks");
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, "hooks.json"), content, "utf-8");
}
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/**
 * Generator for JSON objects that have a valid `hooks.PreToolUse` array.
 * Produces structures like `{ hooks: { PreToolUse: [...], ...extras }, ...extras }`.
 */
const validHooksJsonArb = fc
    .tuple(fc.array(fc.jsonValue(), { maxLength: 5 }), fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.jsonValue(), { maxKeys: 3 }), fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.jsonValue(), { maxKeys: 3 }))
    .map(([preToolUseArr, extraHooksFields, extraTopFields]) => ({
    ...extraTopFields,
    hooks: {
        ...extraHooksFields,
        PreToolUse: preToolUseArr,
    },
}));
/**
 * Generator for arbitrary JSON values that do NOT have `hooks.PreToolUse` as an array.
 * Uses fc.jsonValue() which can produce any valid JSON structure.
 */
const arbitraryJsonValueArb = fc.jsonValue();
// ---------------------------------------------------------------------------
// Feature: audit-remediation-v221, Property 1
// ---------------------------------------------------------------------------
describe("Feature: audit-remediation-v221, Property 1: Hooks validation correctly classifies JSON structures", () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "hooks-prop-"));
    });
    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });
    /**
     * **Validates: Requirements 1.1**
     *
     * For any JSON object that contains hooks.PreToolUse as an array,
     * validateHooksPresence returns valid: true.
     */
    it("returns valid: true for any JSON with hooks.PreToolUse array", () => {
        fc.assert(fc.property(validHooksJsonArb, (jsonObj) => {
            setupHooksDir(tmpDir, JSON.stringify(jsonObj));
            const result = validateHooksPresence(tmpDir);
            expect(result.valid).toBe(true);
            expect(result.reason).toBeUndefined();
        }), { numRuns: 40 });
    });
    /**
     * **Validates: Requirements 1.1**
     *
     * For any arbitrary JSON value that does NOT have hooks.PreToolUse as an array,
     * validateHooksPresence returns valid: false with a non-empty reason.
     */
    it("returns valid: false with non-empty reason for any JSON without hooks.PreToolUse array", () => {
        fc.assert(fc.property(arbitraryJsonValueArb, (jsonVal) => {
            // Determine if this value happens to have hooks.PreToolUse as an array
            const hasValidStructure = jsonVal !== null &&
                typeof jsonVal === "object" &&
                !Array.isArray(jsonVal) &&
                "hooks" in jsonVal &&
                jsonVal.hooks !== null &&
                typeof jsonVal.hooks === "object" &&
                !Array.isArray(jsonVal.hooks) &&
                "PreToolUse" in jsonVal.hooks &&
                Array.isArray(jsonVal.hooks.PreToolUse);
            setupHooksDir(tmpDir, JSON.stringify(jsonVal));
            const result = validateHooksPresence(tmpDir);
            if (hasValidStructure) {
                // This random JSON happens to satisfy the structure — valid: true
                expect(result.valid).toBe(true);
            }
            else {
                // Does not satisfy the structure — valid: false with reason
                expect(result.valid).toBe(false);
                expect(result.reason).toBeDefined();
                expect(typeof result.reason).toBe("string");
                expect(result.reason?.length).toBeGreaterThan(0);
            }
        }), { numRuns: 40 });
    });
    /**
     * **Validates: Requirements 1.1**
     *
     * For any JSON object built with fc.record that has hooks as a non-object or
     * hooks.PreToolUse as a non-array, validateHooksPresence returns valid: false.
     */
    it("returns valid: false for objects where hooks.PreToolUse is not an array", () => {
        // Generate objects with hooks.PreToolUse set to a non-array value
        const nonArrayPreToolUseArb = fc
            .tuple(fc.oneof(fc.constant(null), fc.constant(undefined), fc.string(), fc.integer(), fc.boolean(), fc.dictionary(fc.string({ minLength: 1, maxLength: 5 }), fc.jsonValue(), {
            maxKeys: 3,
        })), fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.jsonValue(), { maxKeys: 3 }))
            .map(([preToolUseVal, extraFields]) => ({
            ...extraFields,
            hooks: { PreToolUse: preToolUseVal },
        }));
        fc.assert(fc.property(nonArrayPreToolUseArb, (jsonObj) => {
            setupHooksDir(tmpDir, JSON.stringify(jsonObj));
            const result = validateHooksPresence(tmpDir);
            expect(result.valid).toBe(false);
            expect(result.reason).toBeDefined();
            expect(result.reason?.length).toBeGreaterThan(0);
        }), { numRuns: 40 });
    });
});
//# sourceMappingURL=hooks-validation.property.test.js.map