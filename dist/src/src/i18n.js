/**
 * I18n engine — lightweight translation lookup, interpolation, and validation.
 *
 * All public functions are pure: they accept data and return results with no
 * side effects. I/O (file loading, env access) is handled by the caller.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 4.1, 4.2, 4.3, 4.4, 4.5, 8.1, 8.3, 8.4**
 */
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Regex matching `{paramName}` placeholders in a template string. */
const PLACEHOLDER_RE = /\{([^}]+)\}/g;
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Resolve a dot-separated key path against a nested translation object.
 *
 * Returns the string value at the path, or `null` when:
 *   - the key is empty or contains empty segments (consecutive dots)
 *   - any segment along the path does not exist
 *   - the resolved value is not a string (e.g. a nested object)
 */
export function lookupKey(data, keyPath) {
    if (keyPath === "")
        return null;
    const segments = keyPath.split(".");
    let current = data;
    for (const segment of segments) {
        // Empty segment means consecutive dots or leading/trailing dot
        if (segment === "")
            return null;
        if (typeof current !== "object" || current === null)
            return null;
        const next = current[segment];
        if (next === undefined)
            return null;
        current = next;
    }
    return typeof current === "string" ? current : null;
}
/**
 * Replace `{paramName}` placeholders in a template string with values from
 * the params object. Placeholders whose key is missing from params are
 * preserved as-is.
 */
export function interpolate(template, params) {
    return template.replace(PLACEHOLDER_RE, (match, name) => {
        const value = params[name];
        return value !== undefined ? value : match;
    });
}
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
export function translate(config, key, params) {
    const { locale, defaultLocale, translations } = config;
    // Try current locale
    const currentData = translations[locale];
    if (currentData) {
        const value = lookupKey(currentData, key);
        if (value !== null) {
            return params ? interpolate(value, params) : value;
        }
    }
    // Try default locale
    if (locale !== defaultLocale) {
        const defaultData = translations[defaultLocale];
        if (defaultData) {
            const value = lookupKey(defaultData, key);
            if (value !== null) {
                return params ? interpolate(value, params) : value;
            }
        }
    }
    // Final fallback — return the key itself
    return key;
}
/**
 * Validate that a value conforms to the `TranslationData` shape: a plain
 * object whose leaf nodes are all strings.
 *
 * Returns `{ valid: true, errors: [] }` when the data is valid, or
 * `{ valid: false, errors: [...] }` with dot-separated paths to every
 * non-string leaf.
 */
export function validateTranslationData(data) {
    const errors = [];
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
        errors.push("(root)");
        return { valid: false, errors };
    }
    function walk(obj, prefix) {
        for (const key of Object.keys(obj)) {
            const path = prefix ? `${prefix}.${key}` : key;
            const value = obj[key];
            if (typeof value === "string") {
                continue;
            }
            if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                walk(value, path);
            }
            else {
                errors.push(path);
            }
        }
    }
    walk(data, "");
    return { valid: errors.length === 0, errors };
}
/**
 * Parse a JSON string into validated `TranslationData`.
 *
 * @throws Error with a descriptive message including `filePath` when:
 *   - the JSON is syntactically invalid
 *   - the parsed value is not a valid `TranslationData` structure
 */
export function parseTranslationFile(jsonString, filePath) {
    let parsed;
    try {
        parsed = JSON.parse(jsonString);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`i18n: Invalid JSON in ${filePath}: ${message}`);
    }
    const result = validateTranslationData(parsed);
    if (!result.valid) {
        throw new Error(`i18n: Invalid translation structure in ${filePath}: non-string values at ${result.errors.join(", ")}`);
    }
    return parsed;
}
//# sourceMappingURL=i18n.js.map