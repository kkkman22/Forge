/**
 * Property-based tests for the ConfigStore module.
 *
 * Covers:
 *   - Property 9: Config lang 字段往返与字段保留
 *   - Property 4: 配置解析正确性
 *   - Property 5: CLI 参数优先于配置文件
 *   - Property 6: 无效配置回退到默认值
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 6.1, 6.4, 8.4**
 *
 * Feature: i18n-support, Property 9: Config lang 字段往返与字段保留
 * Feature: observability-enhancements, Property 4: 配置解析正确性
 * Feature: observability-enhancements, Property 5: CLI 参数优先于配置文件
 * Feature: observability-enhancements, Property 6: 无效配置回退到默认值
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { LogConfigFromFile } from "../src/config-store.js";
import {
    buildDefaultConfig,
    extractConfigLang,
    mergeLogConfig,
    parseLogConfig,
    writeConfigLang,
} from "../src/config-store.js";
import { extractStringField, parseFrontmatter } from "../src/frontmatter.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generate a valid YAML field name (simple alphanumeric + underscore). */
const fieldNameArb = fc
  .stringMatching(/^[a-z][a-z0-9_]{0,19}$/)
  .filter((s) => s.length >= 1 && s !== "lang");

/** Generate a simple string value (no quotes, no newlines, no ---). */
const simpleValueArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => s.trim().length > 0)
  .filter((s) => !s.includes("\n"))
  .filter((s) => !s.includes("---"))
  .filter((s) => !s.includes('"'))
  .map((s) => s.trim());

/** Generate a locale string (realistic language codes). */
const localeArb = fc.oneof(
  fc.constantFrom("zh", "en", "ja", "ko", "fr", "de", "es", "pt", "ru", "ar"),
  fc.stringMatching(/^[a-z]{2,3}$/).filter((s) => s.length >= 2),
);

/** Generate a set of non-lang frontmatter fields as key-value pairs. */
const otherFieldsArb = fc
  .array(fc.tuple(fieldNameArb, simpleValueArb), { minLength: 0, maxLength: 5 })
  .map((pairs) => {
    const seen = new Set<string>();
    return pairs.filter(([key]) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

/** Generate body content that doesn't interfere with frontmatter parsing. */
const bodyArb = fc
  .string({ minLength: 0, maxLength: 50 })
  .filter((s) => !s.trimStart().startsWith("---"));

/**
 * Build config.md content with optional lang field and other fields.
 */
function buildConfigContent(
  otherFields: [string, string][],
  lang: string | null,
  body: string,
): string {
  const lines: string[] = ["---"];
  for (const [key, value] of otherFields) {
    lines.push(`${key}: ${value}`);
  }
  if (lang !== null) {
    lines.push(`lang: ${lang}`);
  }
  lines.push("---");
  if (body) {
    lines.push(body);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Feature: i18n-support, Property 9: Config lang 字段往返与字段保留
// ---------------------------------------------------------------------------

describe("Feature: i18n-support, Property 9: Config lang 字段往返与字段保留", () => {
  /**
   * **Validates: Requirements 6.1**
   *
   * For any config.md content (with or without existing lang field) and any
   * locale string, writing the lang field via writeConfigLang() then
   * extracting via extractConfigLang() returns the written locale.
   */
  it("round-trip: extractConfigLang(writeConfigLang(content, lang)) === lang", () => {
    fc.assert(
      fc.property(otherFieldsArb, localeArb, bodyArb, (fields, lang, body) => {
        // Content with existing lang field
        const contentWithLang = buildConfigContent(fields, "en", body);
        const updatedWithLang = writeConfigLang(contentWithLang, lang);
        expect(extractConfigLang(updatedWithLang)).toBe(lang);

        // Content without lang field
        const contentWithoutLang = buildConfigContent(fields, null, body);
        const updatedWithoutLang = writeConfigLang(contentWithoutLang, lang);
        expect(extractConfigLang(updatedWithoutLang)).toBe(lang);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 6.1**
   *
   * Round-trip works when content has no frontmatter at all.
   */
  it("round-trip works on content with no frontmatter", () => {
    fc.assert(
      fc.property(localeArb, bodyArb, (lang, body) => {
        // Content without any frontmatter
        const plainContent = body.trimStart().startsWith("---") ? `# ${body}` : body;
        const updated = writeConfigLang(plainContent, lang);
        expect(extractConfigLang(updated)).toBe(lang);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 6.1**
   *
   * Round-trip works on empty content.
   */
  it("round-trip works on empty content", () => {
    fc.assert(
      fc.property(localeArb, (lang) => {
        const updated = writeConfigLang("", lang);
        expect(extractConfigLang(updated)).toBe(lang);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 6.4**
   *
   * For any config.md content with arbitrary frontmatter fields (excluding
   * lang), writing a lang field preserves all other fields unchanged.
   */
  it("writeConfigLang preserves all other frontmatter fields", () => {
    fc.assert(
      fc.property(otherFieldsArb, localeArb, bodyArb, (fields, lang, body) => {
        if (fields.length === 0) return; // skip when no other fields to check

        const content = buildConfigContent(fields, null, body);
        const updated = writeConfigLang(content, lang);

        // Parse the updated content and verify all original fields are present
        const parsed = parseFrontmatter(updated);
        expect(parsed).not.toBeNull();
        if (parsed === null) return;

        for (const [key, value] of fields) {
          const extracted = extractStringField(parsed.raw, key);
          expect(extracted).toBe(value);
        }
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 6.4**
   *
   * Updating an existing lang field preserves all other fields.
   */
  it("updating existing lang preserves other fields", () => {
    fc.assert(
      fc.property(
        otherFieldsArb,
        localeArb,
        localeArb,
        bodyArb,
        (fields, oldLang, newLang, body) => {
          if (fields.length === 0) return;

          const content = buildConfigContent(fields, oldLang, body);
          const updated = writeConfigLang(content, newLang);

          // Verify lang was updated
          expect(extractConfigLang(updated)).toBe(newLang);

          // Verify other fields are preserved
          const parsed = parseFrontmatter(updated);
          expect(parsed).not.toBeNull();
          if (parsed === null) return;

          for (const [key, value] of fields) {
            const extracted = extractStringField(parsed.raw, key);
            expect(extracted).toBe(value);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 6.1**
   *
   * buildDefaultConfig produces content where extractConfigLang returns
   * the provided lang.
   */
  it("buildDefaultConfig produces extractable lang", () => {
    fc.assert(
      fc.property(localeArb, (lang) => {
        const content = buildDefaultConfig(lang);
        expect(extractConfigLang(content)).toBe(lang);
      }),
      { numRuns: 200 },
    );
  });
});


// ---------------------------------------------------------------------------
// Generators for observability-enhancements log config properties
// ---------------------------------------------------------------------------

/** Valid log format values. */
const validLogFormatArb = fc.constantFrom("text" as const, "json" as const);

/** Valid log level values. */
const validLogLevelArb = fc.constantFrom(
  "debug" as const,
  "info" as const,
  "warn" as const,
  "error" as const,
);

/**
 * Generate a simple log file path (non-empty, no newlines, no quotes, no ---).
 * Constrained to realistic file path characters.
 */
const logFilePathArb = fc
  .stringMatching(/^[a-zA-Z0-9_/.\-]{1,40}$/)
  .filter((s) => s.length > 0);

/**
 * Build a frontmatter string containing log config fields.
 * Additional non-log fields can be included to test field isolation.
 */
function buildLogConfigFrontmatter(opts: {
  logFormat?: string;
  logLevel?: string;
  logFile?: string;
  extraFields?: [string, string][];
}): string {
  const lines: string[] = ["---"];
  if (opts.extraFields) {
    for (const [key, value] of opts.extraFields) {
      lines.push(`${key}: ${value}`);
    }
  }
  if (opts.logFormat !== undefined) {
    lines.push(`log_format: ${opts.logFormat}`);
  }
  if (opts.logLevel !== undefined) {
    lines.push(`log_level: ${opts.logLevel}`);
  }
  if (opts.logFile !== undefined) {
    lines.push(`log_file: ${opts.logFile}`);
  }
  lines.push("---");
  return lines.join("\n");
}

/**
 * Generate an invalid log format value (not "text" or "json").
 */
const invalidLogFormatArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => s.trim().length > 0)
  .filter((s) => !s.includes("\n") && !s.includes("---") && !s.includes('"'))
  .filter((s) => s.trim() !== "text" && s.trim() !== "json")
  .map((s) => s.trim());

/**
 * Generate an invalid log level value (not debug|info|warn|error).
 */
const invalidLogLevelArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => s.trim().length > 0)
  .filter((s) => !s.includes("\n") && !s.includes("---") && !s.includes('"'))
  .filter(
    (s) =>
      s.trim() !== "debug" &&
      s.trim() !== "info" &&
      s.trim() !== "warn" &&
      s.trim() !== "error",
  )
  .map((s) => s.trim());

// ---------------------------------------------------------------------------
// Feature: observability-enhancements, Property 4: 配置解析正确性
// ---------------------------------------------------------------------------

describe("Feature: observability-enhancements, Property 4: 配置解析正确性", () => {
  /**
   * **Validates: Requirements 2.1, 2.2**
   *
   * For any frontmatter string containing valid log_format, log_level,
   * and log_file fields, parseLogConfig() returns values matching the
   * original field values.
   */
  it("parseLogConfig returns matching values for valid log_format, log_level, log_file", () => {
    fc.assert(
      fc.property(
        validLogFormatArb,
        validLogLevelArb,
        logFilePathArb,
        (format, level, filePath) => {
          const content = buildLogConfigFrontmatter({
            logFormat: format,
            logLevel: level,
            logFile: filePath,
          });

          const result = parseLogConfig(content);

          expect(result.logFormat).toBe(format);
          expect(result.logLevel).toBe(level);
          expect(result.logFile).toBe(filePath);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.1, 2.2**
   *
   * parseLogConfig correctly parses each field independently — missing
   * fields return null while present valid fields are extracted.
   */
  it("parseLogConfig returns null for missing fields, valid values for present fields", () => {
    fc.assert(
      fc.property(validLogFormatArb, validLogLevelArb, (format, level) => {
        // Only log_format present
        const formatOnly = buildLogConfigFrontmatter({ logFormat: format });
        const r1 = parseLogConfig(formatOnly);
        expect(r1.logFormat).toBe(format);
        expect(r1.logLevel).toBeNull();
        expect(r1.logFile).toBeNull();

        // Only log_level present
        const levelOnly = buildLogConfigFrontmatter({ logLevel: level });
        const r2 = parseLogConfig(levelOnly);
        expect(r2.logFormat).toBeNull();
        expect(r2.logLevel).toBe(level);
        expect(r2.logFile).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 2.1, 2.2**
   *
   * parseLogConfig correctly handles frontmatter with extra non-log fields
   * alongside valid log config fields.
   */
  it("parseLogConfig extracts log fields correctly even with extra frontmatter fields", () => {
    fc.assert(
      fc.property(
        validLogFormatArb,
        validLogLevelArb,
        logFilePathArb,
        otherFieldsArb.filter((fields) =>
          fields.every(
            ([k]) => k !== "log_format" && k !== "log_level" && k !== "log_file",
          ),
        ),
        (format, level, filePath, extraFields) => {
          const content = buildLogConfigFrontmatter({
            logFormat: format,
            logLevel: level,
            logFile: filePath,
            extraFields,
          });

          const result = parseLogConfig(content);

          expect(result.logFormat).toBe(format);
          expect(result.logLevel).toBe(level);
          expect(result.logFile).toBe(filePath);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: observability-enhancements, Property 5: CLI 参数优先于配置文件
// ---------------------------------------------------------------------------

describe("Feature: observability-enhancements, Property 5: CLI 参数优先于配置文件", () => {
  /**
   * **Validates: Requirements 2.3**
   *
   * When CLI parameters are non-empty, mergeLogConfig() returns CLI
   * parameter values regardless of config file values.
   */
  it("CLI logFormat overrides config file logFormat", () => {
    fc.assert(
      fc.property(
        validLogFormatArb,
        validLogFormatArb,
        validLogLevelArb,
        logFilePathArb,
        (cliFormat, fileFormat, fileLevel, fileLogFile) => {
          const fileConfig: LogConfigFromFile = {
            logFormat: fileFormat,
            logLevel: fileLevel,
            logFile: fileLogFile,
          };

          const result = mergeLogConfig({ logFormat: cliFormat }, fileConfig);

          expect(result.format).toBe(cliFormat);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.3**
   *
   * When CLI logLevel is non-empty, mergeLogConfig() returns CLI logLevel.
   */
  it("CLI logLevel overrides config file logLevel", () => {
    fc.assert(
      fc.property(
        validLogLevelArb,
        validLogFormatArb,
        validLogLevelArb,
        logFilePathArb,
        (cliLevel, fileFormat, fileLevel, fileLogFile) => {
          const fileConfig: LogConfigFromFile = {
            logFormat: fileFormat,
            logLevel: fileLevel,
            logFile: fileLogFile,
          };

          const result = mergeLogConfig({ logLevel: cliLevel }, fileConfig);

          expect(result.level).toBe(cliLevel);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.3**
   *
   * When CLI logFile is non-empty, mergeLogConfig() returns CLI logFile.
   */
  it("CLI logFile overrides config file logFile", () => {
    fc.assert(
      fc.property(
        logFilePathArb,
        validLogFormatArb,
        validLogLevelArb,
        logFilePathArb,
        (cliLogFile, fileFormat, fileLevel, fileLogFile) => {
          const fileConfig: LogConfigFromFile = {
            logFormat: fileFormat,
            logLevel: fileLevel,
            logFile: fileLogFile,
          };

          const result = mergeLogConfig({ logFile: cliLogFile }, fileConfig);

          expect(result.logFile).toBe(cliLogFile);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.3**
   *
   * When all CLI parameters are specified, all returned fields match CLI values.
   */
  it("all CLI parameters override all config file values simultaneously", () => {
    fc.assert(
      fc.property(
        validLogFormatArb,
        validLogLevelArb,
        logFilePathArb,
        validLogFormatArb,
        validLogLevelArb,
        logFilePathArb,
        (cliFormat, cliLevel, cliLogFile, fileFormat, fileLevel, fileLogFile) => {
          const fileConfig: LogConfigFromFile = {
            logFormat: fileFormat,
            logLevel: fileLevel,
            logFile: fileLogFile,
          };

          const result = mergeLogConfig(
            { logFormat: cliFormat, logLevel: cliLevel, logFile: cliLogFile },
            fileConfig,
          );

          expect(result.format).toBe(cliFormat);
          expect(result.level).toBe(cliLevel);
          expect(result.logFile).toBe(cliLogFile);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: observability-enhancements, Property 6: 无效配置回退到默认值
// ---------------------------------------------------------------------------

describe("Feature: observability-enhancements, Property 6: 无效配置回退到默认值", () => {
  /**
   * **Validates: Requirements 2.4**
   *
   * parseLogConfig returns null for invalid log_format values.
   */
  it("parseLogConfig returns null logFormat for invalid log_format values", () => {
    fc.assert(
      fc.property(invalidLogFormatArb, (invalidFormat) => {
        const content = buildLogConfigFrontmatter({ logFormat: invalidFormat });
        const result = parseLogConfig(content);

        expect(result.logFormat).toBeNull();
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.4**
   *
   * parseLogConfig returns null for invalid log_level values.
   */
  it("parseLogConfig returns null logLevel for invalid log_level values", () => {
    fc.assert(
      fc.property(invalidLogLevelArb, (invalidLevel) => {
        const content = buildLogConfigFrontmatter({ logLevel: invalidLevel });
        const result = parseLogConfig(content);

        expect(result.logLevel).toBeNull();
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.4, 8.4**
   *
   * When config file has invalid log_format and CLI does not specify logFormat,
   * mergeLogConfig falls back to default "text".
   */
  it("mergeLogConfig falls back to default format when config is invalid and CLI unspecified", () => {
    fc.assert(
      fc.property(invalidLogFormatArb, (invalidFormat) => {
        const content = buildLogConfigFrontmatter({ logFormat: invalidFormat });
        const fileConfig = parseLogConfig(content);

        // CLI does not specify logFormat
        const result = mergeLogConfig({}, fileConfig);

        expect(result.format).toBe("text");
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.4, 8.4**
   *
   * When config file has invalid log_level and CLI does not specify logLevel,
   * mergeLogConfig falls back to default "info".
   */
  it("mergeLogConfig falls back to default level when config is invalid and CLI unspecified", () => {
    fc.assert(
      fc.property(invalidLogLevelArb, (invalidLevel) => {
        const content = buildLogConfigFrontmatter({ logLevel: invalidLevel });
        const fileConfig = parseLogConfig(content);

        // CLI does not specify logLevel
        const result = mergeLogConfig({}, fileConfig);

        expect(result.level).toBe("info");
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.4, 8.4**
   *
   * When both log_format and log_level are invalid in config and CLI is empty,
   * mergeLogConfig returns all defaults: format="text", level="info", logFile=null.
   */
  it("mergeLogConfig returns all defaults when both config fields are invalid and CLI is empty", () => {
    fc.assert(
      fc.property(invalidLogFormatArb, invalidLogLevelArb, (invalidFormat, invalidLevel) => {
        const content = buildLogConfigFrontmatter({
          logFormat: invalidFormat,
          logLevel: invalidLevel,
        });
        const fileConfig = parseLogConfig(content);

        const result = mergeLogConfig({}, fileConfig);

        expect(result.format).toBe("text");
        expect(result.level).toBe("info");
        expect(result.logFile).toBeNull();
      }),
      { numRuns: 200 },
    );
  });
});
