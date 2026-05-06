/**
 * Property-based tests for the I18nEngine core module (`src/i18n.ts`).
 *
 * Covers:
 *   - Property 1: 翻译数据 JSON 往返一致性
 *   - Property 2: 点分隔路径查找正确性
 *   - Property 3: 翻译回退链完整性
 *   - Property 4: 字符串插值完备性
 *
 * Feature: i18n-support
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { interpolate, lookupKey, translate, } from "../src/i18n.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Generate a valid key segment (non-empty, no dots, no braces, no __proto__). */
const keySegmentArb = fc
    .stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,9}$/)
    .filter((s) => s.length >= 1)
    .filter((s) => s !== "__proto__");
/** Generate a simple leaf string value (non-empty, no nested structure concerns). */
const leafValueArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);
/**
 * Generate a valid `TranslationData` object (recursive nested string map).
 * Depth is bounded to avoid excessively deep structures.
 */
const translationDataArb = fc.letrec((tie) => ({
    leaf: leafValueArb,
    node: fc.dictionary(keySegmentArb, fc.oneof({ depthIdentifier: "td", withCrossShrink: true }, tie("leaf"), tie("tree")), { minKeys: 1, maxKeys: 4 }),
    tree: fc.dictionary(keySegmentArb, fc.oneof({ depthIdentifier: "td", withCrossShrink: true, depthSize: "small" }, tie("leaf"), tie("node")), { minKeys: 1, maxKeys: 4 }),
})).tree;
/**
 * Collect all dot-separated key paths that lead to string leaves
 * in a TranslationData object.
 */
function collectLeafPaths(data, prefix = "") {
    const paths = [];
    for (const key of Object.keys(data)) {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        const value = data[key];
        if (typeof value === "string") {
            paths.push(fullPath);
        }
        else {
            paths.push(...collectLeafPaths(value, fullPath));
        }
    }
    return paths;
}
/**
 * Collect all dot-separated key paths that lead to non-string (object) nodes
 * in a TranslationData object.
 */
function collectBranchPaths(data, prefix = "") {
    const paths = [];
    for (const key of Object.keys(data)) {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        const value = data[key];
        if (typeof value !== "string") {
            paths.push(fullPath);
            paths.push(...collectBranchPaths(value, fullPath));
        }
    }
    return paths;
}
/** Generate a placeholder-safe identifier for use in {placeholder} patterns. */
const placeholderNameArb = fc
    .stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,9}$/)
    .filter((s) => s.length >= 1);
/** Generate a locale code. */
const localeArb = fc.constantFrom("en", "zh", "ja", "ko", "fr", "de", "es");
// ---------------------------------------------------------------------------
// Feature: i18n-support, Property 1: 翻译数据 JSON 往返一致性
// ---------------------------------------------------------------------------
describe("Feature: i18n-support, Property 1: 翻译数据 JSON 往返一致性", () => {
    /**
     * **Validates: Requirements 1.5**
     *
     * For any valid TranslationData object (nested object with string leaf values),
     * serializing it to JSON and parsing it back shall produce a deeply equal object.
     */
    it("JSON.parse(JSON.stringify(data)) deeply equals original for any valid TranslationData", () => {
        fc.assert(fc.property(translationDataArb, (data) => {
            const serialized = JSON.stringify(data);
            const deserialized = JSON.parse(serialized);
            expect(deserialized).toEqual(data);
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Feature: i18n-support, Property 2: 点分隔路径查找正确性
// ---------------------------------------------------------------------------
describe("Feature: i18n-support, Property 2: 点分隔路径查找正确性", () => {
    /**
     * **Validates: Requirements 1.2, 4.1**
     *
     * For any valid nested translation data object and any dot-separated key path
     * that corresponds to a string leaf value, lookupKey() shall return that exact
     * string value.
     */
    it("lookupKey returns correct string value for valid leaf paths", () => {
        fc.assert(fc.property(translationDataArb, (data) => {
            const leafPaths = collectLeafPaths(data);
            for (const path of leafPaths) {
                const result = lookupKey(data, path);
                // Manually traverse to get expected value
                const segments = path.split(".");
                let expected = data;
                for (const seg of segments) {
                    expected = expected[seg];
                }
                expect(result).toBe(expected);
            }
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 1.2, 4.1**
     *
     * For any key path that does not correspond to a string leaf (points to a
     * nested object), lookupKey() shall return null.
     */
    it("lookupKey returns null for paths pointing to nested objects", () => {
        fc.assert(fc.property(translationDataArb, (data) => {
            const branchPaths = collectBranchPaths(data);
            for (const path of branchPaths) {
                const result = lookupKey(data, path);
                expect(result).toBeNull();
            }
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 1.2, 4.1**
     *
     * For any key path that does not exist in the data, lookupKey() shall return null.
     */
    it("lookupKey returns null for non-existent paths", () => {
        fc.assert(fc.property(translationDataArb, fc.array(keySegmentArb, { minLength: 1, maxLength: 5 }), (data, segments) => {
            const path = segments.join(".");
            lookupKey(data, path);
            // If the path happens to exist and is a string, that's fine — we just
            // verify the function doesn't crash. For truly non-existent paths,
            // we append a guaranteed-missing segment.
            const nonExistentPath = `${path}.__nonexistent__`;
            expect(lookupKey(data, nonExistentPath)).toBeNull();
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 1.2, 4.1**
     *
     * Edge cases: empty key, consecutive dots return null.
     */
    it("lookupKey returns null for empty key and consecutive dots", () => {
        fc.assert(fc.property(translationDataArb, (data) => {
            expect(lookupKey(data, "")).toBeNull();
            expect(lookupKey(data, "..")).toBeNull();
            expect(lookupKey(data, "a..b")).toBeNull();
            expect(lookupKey(data, ".a")).toBeNull();
            expect(lookupKey(data, "a.")).toBeNull();
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Feature: i18n-support, Property 3: 翻译回退链完整性
// ---------------------------------------------------------------------------
describe("Feature: i18n-support, Property 3: 翻译回退链完整性", () => {
    /**
     * **Validates: Requirements 4.3, 4.4**
     *
     * For any I18nConfig: if the key exists in the current locale's translations,
     * translate() shall return that value; else if the key exists in the default
     * locale's translations, translate() shall return the default locale's value;
     * else translate() shall return the key itself.
     */
    it("translate follows fallback chain: current locale → default locale → key", () => {
        fc.assert(fc.property(
        // Generate a key
        fc.array(keySegmentArb, { minLength: 1, maxLength: 3 }).map((segs) => segs.join(".")), 
        // Generate values for current locale, default locale, or neither
        fc.record({
            hasCurrentLocale: fc.boolean(),
            hasDefaultLocale: fc.boolean(),
            currentValue: leafValueArb,
            defaultValue: leafValueArb,
        }), localeArb, (key, opts, currentLocale) => {
            const defaultLocale = currentLocale === "en" ? "zh" : "en";
            const segments = key.split(".");
            // Build translation data by nesting segments
            function buildNested(segs, value) {
                if (segs.length === 1)
                    return { [segs[0]]: value };
                return { [segs[0]]: buildNested(segs.slice(1), value) };
            }
            const translations = {};
            if (opts.hasCurrentLocale) {
                translations[currentLocale] = buildNested(segments, opts.currentValue);
            }
            if (opts.hasDefaultLocale) {
                translations[defaultLocale] = buildNested(segments, opts.defaultValue);
            }
            const config = {
                locale: currentLocale,
                defaultLocale,
                translations,
            };
            const result = translate(config, key);
            if (opts.hasCurrentLocale) {
                expect(result).toBe(opts.currentValue);
            }
            else if (opts.hasDefaultLocale) {
                expect(result).toBe(opts.defaultValue);
            }
            else {
                expect(result).toBe(key);
            }
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 4.3, 4.4**
     *
     * When locale equals defaultLocale and key is missing, translate returns the key.
     */
    it("translate returns key itself when key is missing from all locales", () => {
        fc.assert(fc.property(fc.array(keySegmentArb, { minLength: 1, maxLength: 3 }).map((segs) => segs.join(".")), (key) => {
            const config = {
                locale: "zh",
                defaultLocale: "en",
                translations: {},
            };
            expect(translate(config, key)).toBe(key);
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Feature: i18n-support, Property 4: 字符串插值完备性
// ---------------------------------------------------------------------------
describe("Feature: i18n-support, Property 4: 字符串插值完备性", () => {
    /**
     * **Validates: Requirements 4.2, 4.5**
     *
     * For any template string containing {placeholder} patterns and any params
     * object, interpolate() shall replace every placeholder whose key exists in
     * params with the corresponding value, and shall preserve every placeholder
     * whose key does not exist in params unchanged.
     */
    it("interpolate substitutes present params and preserves missing ones", () => {
        fc.assert(fc.property(
        // Generate a set of placeholder names (some will be in params, some won't)
        fc.array(placeholderNameArb, { minLength: 1, maxLength: 5 }).chain((names) => {
            const uniqueNames = [...new Set(names)];
            // For each name, decide if it's in params
            return fc
                .tuple(fc.constant(uniqueNames), fc.array(fc.boolean(), {
                minLength: uniqueNames.length,
                maxLength: uniqueNames.length,
            }), 
            // Generate replacement values for those in params
            fc.array(leafValueArb, {
                minLength: uniqueNames.length,
                maxLength: uniqueNames.length,
            }), 
            // Generate static text segments between placeholders
            fc.array(fc
                .string({ minLength: 0, maxLength: 20 })
                .filter((s) => !s.includes("{") && !s.includes("}")), { minLength: uniqueNames.length + 1, maxLength: uniqueNames.length + 1 }))
                .map(([pNames, inParams, values, textSegments]) => ({
                names: pNames,
                inParams,
                values,
                textSegments,
            }));
        }), ({ names, inParams, values, textSegments }) => {
            // Build template: text0 {name0} text1 {name1} text2 ...
            let template = "";
            for (let i = 0; i < names.length; i++) {
                template += `${textSegments[i]}{${names[i]}}`;
            }
            template += textSegments[names.length];
            // Build params with only the "in params" names
            const params = {};
            for (let i = 0; i < names.length; i++) {
                if (inParams[i]) {
                    params[names[i]] = values[i];
                }
            }
            const result = interpolate(template, params);
            // Build expected result
            let expected = "";
            for (let i = 0; i < names.length; i++) {
                expected += textSegments[i];
                if (inParams[i]) {
                    expected += values[i];
                }
                else {
                    expected += `{${names[i]}}`;
                }
            }
            expected += textSegments[names.length];
            expect(result).toBe(expected);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 4.2, 4.5**
     *
     * When params is empty, interpolate preserves all placeholders unchanged.
     */
    it("interpolate preserves all placeholders when params is empty", () => {
        fc.assert(fc.property(fc.array(placeholderNameArb, { minLength: 1, maxLength: 5 }), fc.array(fc
            .string({ minLength: 0, maxLength: 20 })
            .filter((s) => !s.includes("{") && !s.includes("}")), { minLength: 2, maxLength: 6 }), (names, textParts) => {
            const uniqueNames = [...new Set(names)];
            // Build template with placeholders
            let template = textParts[0] || "";
            for (let i = 0; i < uniqueNames.length; i++) {
                template += `{${uniqueNames[i]}}${textParts[i + 1] || ""}`;
            }
            const result = interpolate(template, {});
            expect(result).toBe(template);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 4.2, 4.5**
     *
     * When template has no placeholders, interpolate returns the original string.
     */
    it("interpolate returns original string when no placeholders present", () => {
        fc.assert(fc.property(fc
            .string({ minLength: 0, maxLength: 100 })
            .filter((s) => !s.includes("{") && !s.includes("}")), fc.dictionary(placeholderNameArb, leafValueArb, { minKeys: 0, maxKeys: 3 }), (template, params) => {
            expect(interpolate(template, params)).toBe(template);
        }), { numRuns: 50 });
    });
});
//# sourceMappingURL=i18n.property.test.js.map