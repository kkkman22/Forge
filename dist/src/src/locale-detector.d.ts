/**
 * Locale detector — pure-function language detection with priority resolution.
 *
 * Detects the active locale from multiple sources (CLI flag, config file,
 * environment variable, system locale) and normalizes raw locale strings
 * to base language codes. All public functions are pure: no side effects,
 * no direct env/fs access.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 8.2**
 */
/** Input sources for locale detection, ordered by priority (high → low). */
export interface LocaleSources {
    /** CLI `--lang` parameter value. */
    cliLang?: string;
    /** `lang` field from `.forge/config.md`. */
    configLang?: string;
    /** `FORGE_LANG` environment variable. */
    envLang?: string;
    /** System locale from `LANG` / `LC_ALL` environment variables. */
    systemLocale?: string;
}
/** Result of locale detection. */
export interface LocaleResult {
    /** Resolved locale code (e.g. "zh", "en"). */
    locale: string;
    /** Which source provided the winning locale. */
    source: "cli" | "config" | "env" | "system" | "default";
    /** Warning message when the detected locale was unsupported and fell back. */
    warning?: string;
}
/** Set of supported locale codes (read-only). */
export type SupportedLocales = ReadonlySet<string>;
/**
 * Normalize a raw locale string to its base language code.
 *
 * Strips region codes, encoding suffixes, and variant tags:
 *   - `zh_CN.UTF-8` → `zh`
 *   - `en_US`        → `en`
 *   - `ja`           → `ja`
 *   - `EN`           → `en`
 *   - `""`           → `""`
 *
 * The result is always lowercase. Applying the function twice yields the
 * same result as applying it once (idempotent).
 */
export declare function normalizeLocale(rawLocale: string): string;
/**
 * Detect the active locale from multiple sources using a priority chain.
 *
 * Priority (high → low):
 *   1. `cliLang`      — CLI `--lang` flag
 *   2. `configLang`   — `.forge/config.md` lang field
 *   3. `envLang`      — `FORGE_LANG` environment variable
 *   4. `systemLocale` — system `LANG` / `LC_ALL`
 *   5. `defaultLocale` (fallback, defaults to `"en"`)
 *
 * Each source value is normalized before checking against the supported set.
 * Empty or undefined sources are skipped. When a source provides a value
 * that normalizes to an unsupported locale, detection continues to the next
 * source. If *no* source yields a supported locale, the default locale is
 * returned with a warning listing the first unsupported value encountered.
 */
export declare function detectLocale(sources: LocaleSources, supported: SupportedLocales, defaultLocale?: string): LocaleResult;
