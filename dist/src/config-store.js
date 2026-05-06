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
import { extractListField, extractNumericField, extractStringField, parseFrontmatter, } from "./frontmatter.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** The frontmatter field name used to store the language preference. */
const LANG_FIELD = "lang";
/** Valid log format values. */
const VALID_LOG_FORMATS = new Set(["text", "json"]);
/** Valid log level values. */
const VALID_LOG_LEVELS = new Set(["debug", "info", "warn", "error"]);
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
export function extractConfigLang(content) {
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
export function writeConfigLang(content, lang) {
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
    let updatedRaw;
    if (existingLang !== null) {
        // Replace existing lang field value
        const langLineRegex = new RegExp(`^(${LANG_FIELD}:\\s*).*$`, "m");
        updatedRaw = parsed.raw.replace(langLineRegex, `$1${lang}`);
    }
    else {
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
export function buildDefaultConfig(lang) {
    return `---\n${LANG_FIELD}: ${lang}\n---\n`;
}
export const CONFIG_DEFAULTS = {
    project: "unknown",
    stack: ["TypeScript"],
    security_level: 1,
    knowledge_limit: 20,
    max_parallel_agents: 6,
};
/**
 * Parse config.md frontmatter with graceful fallback to defaults.
 *
 * - undefined/empty content → all defaults + warnings
 * - missing frontmatter → all defaults + warnings
 * - partial fields → missing fields use CONFIG_DEFAULTS + warnings
 * - invalid numeric fields → use defaults + warnings
 */
export function parseConfigGraceful(content) {
    const warnings = [];
    if (content === undefined || content.trim() === "") {
        warnings.push("Config content is empty or undefined, using all defaults");
        return { parsed: { ...CONFIG_DEFAULTS, stack: [...CONFIG_DEFAULTS.stack] }, warnings };
    }
    const fm = parseFrontmatter(content);
    if (fm === null) {
        warnings.push("Config has no valid YAML frontmatter, using all defaults");
        return { parsed: { ...CONFIG_DEFAULTS, stack: [...CONFIG_DEFAULTS.stack] }, warnings };
    }
    const projectStr = extractStringField(fm.raw, "project");
    const stackList = extractListField(fm.raw, "stack");
    const securityLevel = extractNumericField(fm.raw, "security_level");
    const knowledgeLimit = extractNumericField(fm.raw, "knowledge_limit");
    const maxParallelAgents = extractNumericField(fm.raw, "max_parallel_agents");
    if (projectStr === null)
        warnings.push("Config missing 'project', defaulting to 'unknown'");
    if (stackList.length === 0)
        warnings.push("Config missing 'stack', defaulting to ['TypeScript']");
    if (securityLevel === null)
        warnings.push("Config missing 'security_level', defaulting to 1");
    if (knowledgeLimit === null)
        warnings.push("Config missing 'knowledge_limit', defaulting to 20");
    if (maxParallelAgents === null)
        warnings.push("Config missing 'max_parallel_agents', defaulting to 6");
    const parsed = {
        project: projectStr ?? CONFIG_DEFAULTS.project,
        stack: stackList.length > 0 ? stackList : CONFIG_DEFAULTS.stack,
        security_level: securityLevel ?? CONFIG_DEFAULTS.security_level,
        knowledge_limit: knowledgeLimit ?? CONFIG_DEFAULTS.knowledge_limit,
        max_parallel_agents: maxParallelAgents ?? CONFIG_DEFAULTS.max_parallel_agents,
    };
    return { parsed, warnings };
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
export function parseLogConfig(frontmatterRaw) {
    const parsed = parseFrontmatter(frontmatterRaw);
    if (parsed === null) {
        return { logFormat: null, logLevel: null, logFile: null };
    }
    const rawFormat = extractStringField(parsed.raw, LOG_FORMAT_FIELD);
    const rawLevel = extractStringField(parsed.raw, LOG_LEVEL_FIELD);
    const rawFile = extractStringField(parsed.raw, LOG_FILE_FIELD);
    const logFormat = rawFormat !== null && VALID_LOG_FORMATS.has(rawFormat) ? rawFormat : null;
    const logLevel = rawLevel !== null && VALID_LOG_LEVELS.has(rawLevel) ? rawLevel : null;
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
export function mergeLogConfig(cliOpts, fileConfig) {
    // Resolve format: CLI > file > default "text"
    let format = "text";
    if (cliOpts.logFormat && VALID_LOG_FORMATS.has(cliOpts.logFormat)) {
        format = cliOpts.logFormat;
    }
    else if (fileConfig.logFormat !== null) {
        format = fileConfig.logFormat;
    }
    // Resolve level: CLI > file > default "info"
    let level = "info";
    if (cliOpts.logLevel && VALID_LOG_LEVELS.has(cliOpts.logLevel)) {
        level = cliOpts.logLevel;
    }
    else if (fileConfig.logLevel !== null) {
        level = fileConfig.logLevel;
    }
    // Resolve logFile: CLI > file > default null
    let logFile = null;
    if (cliOpts.logFile && cliOpts.logFile.length > 0) {
        logFile = cliOpts.logFile;
    }
    else if (fileConfig.logFile !== null) {
        logFile = fileConfig.logFile;
    }
    return { format, level, logFile };
}
//# sourceMappingURL=config-store.js.map