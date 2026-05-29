/**
 * I18n engine — lightweight translation lookup, interpolation, and validation.
 *
 * All public functions are pure: they accept data and return results with no
 * side effects. I/O (file loading, env access) is handled by the caller.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 4.1, 4.2, 4.3, 4.4, 4.5, 8.1, 8.3, 8.4**
 */
/** Recursive nested string map — every leaf must be a string. */
export type TranslationData = {
    [key: string]: string | TranslationData;
};
/** Locale-keyed collection of translation data. */
export interface TranslationStore {
    [locale: string]: TranslationData;
}
/** Configuration passed to the translate function. */
export interface I18nConfig {
    /** Current display locale (e.g. "zh"). */
    locale: string;
    /** Fallback locale when a key is missing in the current locale (e.g. "en"). */
    defaultLocale: string;
    /** Loaded translation data keyed by locale. */
    translations: TranslationStore;
}
/**
 * Resolve a dot-separated key path against a nested translation object.
 *
 * Returns the string value at the path, or `null` when:
 *   - the key is empty or contains empty segments (consecutive dots)
 *   - any segment along the path does not exist
 *   - the resolved value is not a string (e.g. a nested object)
 */
export declare function lookupKey(data: TranslationData, keyPath: string): string | null;
/**
 * Replace `{paramName}` placeholders in a template string with values from
 * the params object. Placeholders whose key is missing from params are
 * preserved as-is.
 */
export declare function interpolate(template: string, params: Record<string, string>): string;
/**
 * Core translation function with fallback chain:
 *
 *   1. Look up `key` in the current locale's translations.
 *   2. If not found, look up `key` in the default locale's translations.
 *   3. If still not found, return the key itself.
 *
 * When a translation is found and `params` are provided, placeholder
 * interpolation is applied before returning.
 */
export declare function translate(config: I18nConfig, key: string, params?: Record<string, string>): string;
/**
 * Validate that a value conforms to the `TranslationData` shape: a plain
 * object whose leaf nodes are all strings.
 *
 * Returns `{ valid: true, errors: [] }` when the data is valid, or
 * `{ valid: false, errors: [...] }` with dot-separated paths to every
 * non-string leaf.
 */
export declare function validateTranslationData(data: unknown): {
    valid: boolean;
    errors: string[];
};
/**
 * Parse a JSON string into validated `TranslationData`.
 *
 * @throws Error with a descriptive message including `filePath` when:
 *   - the JSON is syntactically invalid
 *   - the parsed value is not a valid `TranslationData` structure
 */
export declare function parseTranslationFile(jsonString: string, filePath: string): TranslationData;
