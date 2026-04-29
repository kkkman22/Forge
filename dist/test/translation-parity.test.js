/**
 * Smoke test — verify key parity between en.json and zh.json translation files.
 *
 * Asserts:
 * 1. Both files have identical key structures (same nested keys).
 * 2. Internal debug/log strings are not present in translation files.
 *
 * **Validates: Requirements 7.1, 7.2, 7.3**
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Recursively extract all dot-separated key paths from a nested object. */
function extractKeys(obj, prefix = "") {
    const keys = [];
    for (const key of Object.keys(obj).sort()) {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];
        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            keys.push(...extractKeys(value, fullPath));
        }
        else {
            keys.push(fullPath);
        }
    }
    return keys;
}
/** Recursively collect all leaf string values from a nested object. */
function extractValues(obj) {
    const values = [];
    for (const value of Object.values(obj)) {
        if (typeof value === "string") {
            values.push(value);
        }
        else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            values.push(...extractValues(value));
        }
    }
    return values;
}
// ---------------------------------------------------------------------------
// Load translation files
// ---------------------------------------------------------------------------
const localesDir = join(__dirname, "..", "locales");
const enData = JSON.parse(readFileSync(join(localesDir, "en.json"), "utf-8"));
const zhData = JSON.parse(readFileSync(join(localesDir, "zh.json"), "utf-8"));
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("Translation parity: en.json ↔ zh.json", () => {
    it("should have identical key structures", () => {
        const enKeys = extractKeys(enData);
        const zhKeys = extractKeys(zhData);
        expect(enKeys).toEqual(zhKeys);
    });
    it("should have the same number of leaf keys", () => {
        const enKeys = extractKeys(enData);
        const zhKeys = extractKeys(zhData);
        expect(enKeys.length).toBe(zhKeys.length);
        expect(enKeys.length).toBeGreaterThan(0);
    });
    it("en.json should not contain keys missing from zh.json", () => {
        const enKeys = new Set(extractKeys(enData));
        const zhKeys = new Set(extractKeys(zhData));
        const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));
        expect(missingInZh).toEqual([]);
    });
    it("zh.json should not contain keys missing from en.json", () => {
        const enKeys = new Set(extractKeys(enData));
        const zhKeys = new Set(extractKeys(zhData));
        const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k));
        expect(missingInEn).toEqual([]);
    });
    it("all leaf values should be strings", () => {
        const enKeys = extractKeys(enData);
        const zhKeys = extractKeys(zhData);
        for (const key of enKeys) {
            const segments = key.split(".");
            let value = enData;
            for (const seg of segments) {
                value = value[seg];
            }
            expect(typeof value).toBe("string");
        }
        for (const key of zhKeys) {
            const segments = key.split(".");
            let value = zhData;
            for (const seg of segments) {
                value = value[seg];
            }
            expect(typeof value).toBe("string");
        }
    });
    it("should preserve {paramName} placeholders across both locales", () => {
        const enKeys = extractKeys(enData);
        const placeholderRe = /\{([^}]+)\}/g;
        for (const key of enKeys) {
            const segments = key.split(".");
            let enValue = enData;
            let zhValue = zhData;
            for (const seg of segments) {
                enValue = enValue[seg];
                zhValue = zhValue[seg];
            }
            const enPlaceholders = [...enValue.matchAll(placeholderRe)]
                .map((m) => m[1])
                .sort();
            const zhPlaceholders = [...zhValue.matchAll(placeholderRe)]
                .map((m) => m[1])
                .sort();
            expect(zhPlaceholders, `Placeholder mismatch for key "${key}"`).toEqual(enPlaceholders);
        }
    });
});
describe("Translation files: no internal debug strings", () => {
    it("should not contain [debug] prefixed strings", () => {
        const enValues = extractValues(enData);
        const zhValues = extractValues(zhData);
        for (const val of [...enValues, ...zhValues]) {
            expect(val).not.toMatch(/^\[debug\]/);
        }
    });
    it("should not contain internal debug log patterns", () => {
        const enValues = extractValues(enData);
        const zhValues = extractValues(zhData);
        const debugPatterns = [
            /^\[debug\]/,
            /^debug:/i,
            /closeSync failed/,
            /unlinkSync failed/,
            /worktree removal failed/,
            /run directory cleanup failed/,
            /readFileContent failed/,
            /collectUnresolvedIssues failed/,
            /detectSkillAwareMode failed/,
            /StatusFile read failed during startup/,
        ];
        for (const val of [...enValues, ...zhValues]) {
            for (const pattern of debugPatterns) {
                expect(val, `Value "${val}" matches debug pattern ${pattern}`).not.toMatch(pattern);
            }
        }
    });
});
//# sourceMappingURL=translation-parity.test.js.map