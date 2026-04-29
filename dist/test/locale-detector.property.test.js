/**
 * Property-based tests for the LocaleDetector module.
 *
 * Covers:
 *   - Property 5: 语言优先级解析正确性
 *   - Property 6: Locale 规范化幂等性
 *   - Property 7: 不支持的语言回退
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { detectLocale, normalizeLocale, } from "../src/locale-detector.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Base language codes used throughout the tests. */
const BASE_LOCALES = ["zh", "en", "ja", "ko", "fr", "de", "es", "pt", "ru", "it"];
/** Generate a base language code from the known set. */
const baseLocaleArb = fc.constantFrom(...BASE_LOCALES);
/** Region suffixes that can be appended to a base locale. */
const regionSuffixes = ["_CN", "_TW", "_US", "_GB", "_JP", "_KR", "_FR", "_DE", "-Hans", "-Hant"];
/** Encoding suffixes that can follow a region code. */
const encodingSuffixes = [".UTF-8", ".utf8", ".EUC-JP", ".ISO-8859-1", ".GB2312"];
/** Variant tags that can follow encoding. */
const variantTags = ["@euro", "@cyrillic", "@latin"];
/**
 * Generate a raw locale string with optional region, encoding, and variant.
 * Examples: "zh", "zh_CN", "zh_CN.UTF-8", "en_US.UTF-8@euro"
 */
const rawLocaleArb = fc
    .tuple(baseLocaleArb, fc.option(fc.constantFrom(...regionSuffixes), { nil: undefined }), fc.option(fc.constantFrom(...encodingSuffixes), { nil: undefined }), fc.option(fc.constantFrom(...variantTags), { nil: undefined }), fc.boolean())
    .map(([base, region, encoding, variant, upper]) => {
    let raw = base;
    if (region)
        raw += region;
    if (encoding)
        raw += encoding;
    if (variant)
        raw += variant;
    return upper ? raw.toUpperCase() : raw;
});
/**
 * Generate a supported locales set containing 2-5 locales from the base set.
 */
const supportedSetArb = fc
    .subarray([...BASE_LOCALES], { minLength: 2, maxLength: 5 })
    .map((arr) => new Set(arr));
/**
 * Generate a locale string guaranteed NOT to be in a given supported set.
 * We use a fixed set of "exotic" locale codes that are never in BASE_LOCALES.
 */
const UNSUPPORTED_LOCALES = ["xx", "yy", "zz", "qq", "ww", "aa", "bb"];
const unsupportedLocaleArb = fc.constantFrom(...UNSUPPORTED_LOCALES);
/**
 * Generate an optional locale value: either a raw locale string or undefined.
 */
function optionalLocaleArb(locales) {
    return fc.option(fc.constantFrom(...locales), { nil: undefined });
}
// ---------------------------------------------------------------------------
// Feature: i18n-support, Property 5: 语言优先级解析正确性
// ---------------------------------------------------------------------------
describe("Feature: i18n-support, Property 5: 语言优先级解析正确性", () => {
    /**
     * **Validates: Requirements 2.1, 2.2**
     *
     * For any combination of present/absent locale sources where at least one
     * source contains a supported locale, detectLocale() shall return the value
     * from the highest-priority source that is both present and supported.
     */
    it("highest-priority supported source wins", () => {
        const supported = new Set(["zh", "en", "ja", "ko"]);
        const supportedArr = ["zh", "en", "ja", "ko"];
        const defaultLocale = "en";
        fc.assert(fc.property(optionalLocaleArb(supportedArr), optionalLocaleArb(supportedArr), optionalLocaleArb(supportedArr), optionalLocaleArb(supportedArr), (cliLang, configLang, envLang, systemLocale) => {
            const sources = { cliLang, configLang, envLang, systemLocale };
            const result = detectLocale(sources, supported, defaultLocale);
            // Determine expected winner by walking priority order
            const ordered = [
                { value: cliLang, source: "cli" },
                { value: configLang, source: "config" },
                { value: envLang, source: "env" },
                { value: systemLocale, source: "system" },
            ];
            let expectedLocale = defaultLocale;
            let expectedSource = "default";
            for (const { value, source } of ordered) {
                if (value !== undefined && value !== "") {
                    const normalized = normalizeLocale(value);
                    if (normalized !== "" && supported.has(normalized)) {
                        expectedLocale = normalized;
                        expectedSource = source;
                        break;
                    }
                }
            }
            expect(result.locale).toBe(expectedLocale);
            expect(result.source).toBe(expectedSource);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 2.1, 2.2**
     *
     * When cliLang is present and supported, it always wins regardless of
     * other sources.
     */
    it("cliLang always takes precedence when supported", () => {
        const supported = new Set(["zh", "en", "ja"]);
        const supportedArr = ["zh", "en", "ja"];
        fc.assert(fc.property(fc.constantFrom(...supportedArr), optionalLocaleArb(supportedArr), optionalLocaleArb(supportedArr), optionalLocaleArb(supportedArr), (cliLang, configLang, envLang, systemLocale) => {
            const sources = { cliLang, configLang, envLang, systemLocale };
            const result = detectLocale(sources, supported, "en");
            expect(result.locale).toBe(cliLang);
            expect(result.source).toBe("cli");
            expect(result.warning).toBeUndefined();
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 2.1, 2.2**
     *
     * When no source is present, the default locale is returned.
     */
    it("returns default when all sources are absent", () => {
        fc.assert(fc.property(supportedSetArb, baseLocaleArb, (supported, defaultLocale) => {
            const sources = {};
            const result = detectLocale(sources, supported, defaultLocale);
            expect(result.locale).toBe(defaultLocale);
            expect(result.source).toBe("default");
            expect(result.warning).toBeUndefined();
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: i18n-support, Property 6: Locale 规范化幂等性
// ---------------------------------------------------------------------------
describe("Feature: i18n-support, Property 6: Locale 规范化幂等性", () => {
    /**
     * **Validates: Requirements 2.4**
     *
     * For any raw locale string, applying normalizeLocale twice produces the
     * same result as applying it once (idempotent).
     */
    it("normalizeLocale is idempotent", () => {
        fc.assert(fc.property(rawLocaleArb, (raw) => {
            const once = normalizeLocale(raw);
            const twice = normalizeLocale(once);
            expect(twice).toBe(once);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 2.4**
     *
     * normalizeLocale always returns a lowercase string.
     */
    it("normalizeLocale always returns lowercase", () => {
        fc.assert(fc.property(rawLocaleArb, (raw) => {
            const result = normalizeLocale(raw);
            expect(result).toBe(result.toLowerCase());
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 2.4**
     *
     * normalizeLocale strips region codes, encoding suffixes, and variant tags,
     * returning only the base language code.
     */
    it("normalizeLocale extracts base language code", () => {
        fc.assert(fc.property(baseLocaleArb, fc.option(fc.constantFrom(...regionSuffixes), { nil: undefined }), fc.option(fc.constantFrom(...encodingSuffixes), { nil: undefined }), fc.option(fc.constantFrom(...variantTags), { nil: undefined }), (base, region, encoding, variant) => {
            let raw = base;
            if (region)
                raw += region;
            if (encoding)
                raw += encoding;
            if (variant)
                raw += variant;
            expect(normalizeLocale(raw)).toBe(base.toLowerCase());
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 2.4**
     *
     * Empty string input returns empty string.
     */
    it("normalizeLocale returns empty string for empty input", () => {
        expect(normalizeLocale("")).toBe("");
    });
});
// ---------------------------------------------------------------------------
// Feature: i18n-support, Property 7: 不支持的语言回退
// ---------------------------------------------------------------------------
describe("Feature: i18n-support, Property 7: 不支持的语言回退", () => {
    /**
     * **Validates: Requirements 2.3**
     *
     * For any locale string not in the supported set, detectLocale returns
     * the default locale with a warning present.
     */
    it("unsupported locale falls back to default with warning", () => {
        const supported = new Set(["zh", "en"]);
        fc.assert(fc.property(unsupportedLocaleArb, (unsupportedLocale) => {
            // Ensure the locale is truly unsupported
            fc.pre(!supported.has(normalizeLocale(unsupportedLocale)));
            const sources = { cliLang: unsupportedLocale };
            const result = detectLocale(sources, supported, "en");
            expect(result.locale).toBe("en");
            expect(result.source).toBe("default");
            expect(result.warning).toBeDefined();
            expect(result.warning).toContain(normalizeLocale(unsupportedLocale));
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 2.3**
     *
     * When all sources provide unsupported locales, the result is the default
     * locale with a warning.
     */
    it("all unsupported sources fall back to default with warning", () => {
        const supported = new Set(["zh", "en"]);
        fc.assert(fc.property(unsupportedLocaleArb, unsupportedLocaleArb, unsupportedLocaleArb, unsupportedLocaleArb, (cli, config, env, system) => {
            const sources = {
                cliLang: cli,
                configLang: config,
                envLang: env,
                systemLocale: system,
            };
            const result = detectLocale(sources, supported, "en");
            expect(result.locale).toBe("en");
            expect(result.source).toBe("default");
            expect(result.warning).toBeDefined();
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 2.3**
     *
     * When a lower-priority source has a supported locale but a higher-priority
     * source has an unsupported one, the supported lower-priority source wins
     * (unsupported sources are skipped, not used for fallback warning).
     */
    it("skips unsupported sources and finds supported lower-priority source", () => {
        const supported = new Set(["zh", "en"]);
        fc.assert(fc.property(unsupportedLocaleArb, fc.constantFrom("zh", "en"), (unsupportedCli, supportedConfig) => {
            const sources = {
                cliLang: unsupportedCli,
                configLang: supportedConfig,
            };
            const result = detectLocale(sources, supported, "en");
            expect(result.locale).toBe(supportedConfig);
            expect(result.source).toBe("config");
            expect(result.warning).toBeUndefined();
        }), { numRuns: 200 });
    });
});
//# sourceMappingURL=locale-detector.property.test.js.map