/**
 * ConfigStore module — pure functions for reading and writing the `lang`
 * field in `.forge/config.md` frontmatter, and for parsing/merging log
 * configuration from config files and CLI parameters.
 *
 * Reuses `parseFrontmatter()` and `extractStringField()` from `frontmatter.ts`
 * to avoid duplicating YAML parsing logic. All functions are pure: they accept
 * content strings and return results with no I/O side effects.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 6.1, 6.2, 6.3, 6.4, 8.4**
 */
import type { LogLevel } from "./logger/types.js";
/**
 * Extract the `lang` field from config.md content.
 *
 * Reuses `parseFrontmatter()` + `extractStringField()` from frontmatter.ts.
 *
 * @param content - The full config.md file content
 * @returns The `lang` field value, or `null` if missing or no frontmatter
 */
export declare function extractConfigLang(content: string): string | null;
/**
 * Write (or update) the `lang` field in config.md content.
 *
 * Behaviour:
 *   - If the content already has frontmatter with a `lang` field, update it.
 *   - If the content has frontmatter but no `lang` field, append it.
 *   - If the content has no frontmatter, create a full frontmatter block.
 *
 * All other existing frontmatter fields are preserved unchanged.
 *
 * @param content - Existing config.md content (may be empty)
 * @param lang - The language code to write
 * @returns Updated config.md content
 */
export declare function writeConfigLang(content: string, lang: string): string;
/**
 * Generate default config.md content with a frontmatter block containing
 * the `lang` field.
 *
 * @param lang - The language code to include
 * @returns A complete config.md content string
 */
export declare function buildDefaultConfig(lang: string): string;
/**
 * Log configuration parsed from `.forge/config.md` frontmatter.
 * All fields are nullable — `null` indicates the field was not present
 * or had an invalid value.
 */
export interface LogConfigFromFile {
    /** Log format: "text" or "json", or null if missing/invalid. */
    logFormat: "text" | "json" | null;
    /** Log level, or null if missing/invalid. */
    logLevel: LogLevel | null;
    /** Log file path, or null if not configured. */
    logFile: string | null;
}
/**
 * Fully resolved log configuration after merging CLI parameters and
 * config file values. All fields have concrete values (no nulls except
 * logFile which is null when no file output is desired).
 */
export interface ResolvedLogConfig {
    /** Resolved log format. */
    format: "text" | "json";
    /** Resolved log level. */
    level: LogLevel;
    /** Resolved log file path, or null if no file output. */
    logFile: string | null;
}
/**
 * Parse log configuration from raw frontmatter content (pure function).
 *
 * Reuses `parseFrontmatter()` + `extractStringField()` to extract
 * `log_format`, `log_level`, and `log_file` fields. Invalid values for
 * `log_format` (not "text"|"json") or `log_level` (not a valid LogLevel)
 * are silently ignored and returned as `null`.
 *
 * @param frontmatterRaw - The full config.md file content (including --- delimiters)
 * @returns Parsed log configuration with null for missing/invalid fields
 *
 * **Validates: Requirements 2.1, 2.2, 2.4, 2.5**
 */
export declare function parseLogConfig(frontmatterRaw: string): LogConfigFromFile;
/**
 * Merge CLI parameters and config file log settings (pure function).
 *
 * Priority: CLI parameters > config file values > defaults.
 * Defaults: format = "text", level = "info", logFile = null.
 *
 * @param cliOpts - CLI parameter values (may be undefined/empty)
 * @param fileConfig - Parsed config file values
 * @returns Fully resolved log configuration
 *
 * **Validates: Requirements 2.3, 2.4, 8.4**
 */
export declare function mergeLogConfig(cliOpts: {
    logFormat?: string;
    logLevel?: string;
    logFile?: string;
}, fileConfig: LogConfigFromFile): ResolvedLogConfig;
