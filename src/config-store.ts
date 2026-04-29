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

import { extractStringField, parseFrontmatter } from "./frontmatter.js";
import type { LogLevel } from "./logger/types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The frontmatter field name used to store the language preference. */
const LANG_FIELD = "lang";

/** Valid log format values. */
const VALID_LOG_FORMATS = new Set<string>(["text", "json"]);

/** Valid log level values. */
const VALID_LOG_LEVELS = new Set<string>(["debug", "info", "warn", "error"]);

/** Frontmatter field names for log configuration. */
const LOG_FORMAT_FIELD = "log_format";
const LOG_LEVEL_FIELD = "log_level";
const LOG_FILE_FIELD = "log_file";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract the `lang` field from config.md content.
 *
 * Reuses `parseFrontmatter()` + `extractStringField()` from frontmatter.ts.
 *
 * @param content - The full config.md file content
 * @returns The `lang` field value, or `null` if missing or no frontmatter
 */
export function extractConfigLang(content: string): string | null {
  const parsed = parseFrontmatter(content);
  if (parsed === null) {
    return null;
  }
  return extractStringField(parsed.raw, LANG_FIELD);
}

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
export function writeConfigLang(content: string, lang: string): string {
  const parsed = parseFrontmatter(content);

  if (parsed === null) {
    // No frontmatter — create a new frontmatter block and prepend it
    const frontmatter = `---\n${LANG_FIELD}: ${lang}\n---\n`;
    const trimmed = content.trimStart();
    if (trimmed.length === 0) {
      return frontmatter;
    }
    return `${frontmatter}${trimmed}`;
  }

  // Frontmatter exists — check if lang field is already present
  const existingLang = extractStringField(parsed.raw, LANG_FIELD);

  let updatedRaw: string;
  if (existingLang !== null) {
    // Replace existing lang field value
    const langLineRegex = new RegExp(`^(${LANG_FIELD}:\\s*).*$`, "m");
    updatedRaw = parsed.raw.replace(langLineRegex, `$1${lang}`);
  } else {
    // Append lang field to existing frontmatter
    updatedRaw = `${parsed.raw}\n${LANG_FIELD}: ${lang}`;
  }

  // Reconstruct the full content
  const body = parsed.body;
  if (body.length === 0) {
    return `---${updatedRaw}\n---\n`;
  }
  return `---${updatedRaw}\n---\n${body}`;
}

/**
 * Generate default config.md content with a frontmatter block containing
 * the `lang` field.
 *
 * @param lang - The language code to include
 * @returns A complete config.md content string
 */
export function buildDefaultConfig(lang: string): string {
  return `---\n${LANG_FIELD}: ${lang}\n---\n`;
}

// ---------------------------------------------------------------------------
// Log Configuration Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Log Configuration Functions
// ---------------------------------------------------------------------------

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
export function parseLogConfig(frontmatterRaw: string): LogConfigFromFile {
  const parsed = parseFrontmatter(frontmatterRaw);

  if (parsed === null) {
    return { logFormat: null, logLevel: null, logFile: null };
  }

  const rawFormat = extractStringField(parsed.raw, LOG_FORMAT_FIELD);
  const rawLevel = extractStringField(parsed.raw, LOG_LEVEL_FIELD);
  const rawFile = extractStringField(parsed.raw, LOG_FILE_FIELD);

  const logFormat =
    rawFormat !== null && VALID_LOG_FORMATS.has(rawFormat) ? (rawFormat as "text" | "json") : null;

  const logLevel =
    rawLevel !== null && VALID_LOG_LEVELS.has(rawLevel) ? (rawLevel as LogLevel) : null;

  const logFile = rawFile !== null && rawFile.length > 0 ? rawFile : null;

  return { logFormat, logLevel, logFile };
}

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
export function mergeLogConfig(
  cliOpts: { logFormat?: string; logLevel?: string; logFile?: string },
  fileConfig: LogConfigFromFile,
): ResolvedLogConfig {
  // Resolve format: CLI > file > default "text"
  let format: "text" | "json" = "text";
  if (cliOpts.logFormat && VALID_LOG_FORMATS.has(cliOpts.logFormat)) {
    format = cliOpts.logFormat as "text" | "json";
  } else if (fileConfig.logFormat !== null) {
    format = fileConfig.logFormat;
  }

  // Resolve level: CLI > file > default "info"
  let level: LogLevel = "info";
  if (cliOpts.logLevel && VALID_LOG_LEVELS.has(cliOpts.logLevel)) {
    level = cliOpts.logLevel as LogLevel;
  } else if (fileConfig.logLevel !== null) {
    level = fileConfig.logLevel;
  }

  // Resolve logFile: CLI > file > default null
  let logFile: string | null = null;
  if (cliOpts.logFile && cliOpts.logFile.length > 0) {
    logFile = cliOpts.logFile;
  } else if (fileConfig.logFile !== null) {
    logFile = fileConfig.logFile;
  }

  return { format, level, logFile };
}
