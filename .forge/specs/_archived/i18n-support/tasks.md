---
status: approved
feature: i18n-support
layout: tasks
created: 2026-04-28
spec_ref: ".forge/specs/i18n-support/requirements.md"
---

# Implementation Plan: i18n Support (国际化)

## Overview

Implement a lightweight i18n framework for the Forge project with runtime language switching between Chinese (zh) and English (en). The implementation follows the project's pure function design pattern with no external i18n dependencies. Tasks are ordered to build core pure function modules first, then translation data, CLI integration, source string extraction, and finally SKILL.md multi-language support.

## Tasks

- [x] 1. Implement I18nEngine core module (`src/i18n.ts`)
  - [x] 1.1 Create `src/i18n.ts` with type definitions (`TranslationData`, `TranslationStore`, `I18nConfig`)
    - Define `TranslationData` as recursive nested string map type
    - Define `TranslationStore` as locale-keyed map of `TranslationData`
    - Define `I18nConfig` interface with `locale`, `defaultLocale`, and `translations` fields
    - _Requirements: 1.1, 8.1_

  - [x] 1.2 Implement `lookupKey()` pure function for dot-separated path resolution
    - Split key path by `.` and traverse nested object
    - Return `string | null` — null when path is invalid or points to non-string node
    - Handle edge cases: empty string key, consecutive dots, path pointing to nested object
    - _Requirements: 1.2, 8.1_

  - [x] 1.3 Implement `interpolate()` pure function for `{placeholder}` substitution
    - Use regex to find `{paramName}` patterns in template string
    - Replace with corresponding value from params object
    - Preserve original placeholder text when key is missing from params
    - _Requirements: 4.2, 4.5, 8.3_

  - [x] 1.4 Implement `translate()` pure function with fallback chain
    - Lookup key in current locale translations first
    - Fall back to default locale (en) translations if not found
    - Return key itself as final fallback
    - Apply `interpolate()` if params provided and translation found
    - _Requirements: 4.1, 4.3, 4.4, 8.1, 8.4_

  - [x] 1.5 Implement `validateTranslationData()` and `parseTranslationFile()` functions
    - `validateTranslationData()`: verify all leaf nodes are strings, return error paths
    - `parseTranslationFile()`: parse JSON string, validate structure, throw descriptive error with file path on failure
    - _Requirements: 1.3, 1.5_

  - [x] 1.6 Write property test for JSON round-trip consistency (Property 1)
    - **Property 1: 翻译数据 JSON 往返一致性**
    - Generate arbitrary valid `TranslationData` objects with fast-check
    - Assert `JSON.parse(JSON.stringify(data))` deeply equals original
    - **Validates: Requirements 1.5**

  - [x] 1.7 Write property test for dot-separated path lookup (Property 2)
    - **Property 2: 点分隔路径查找正确性**
    - Generate nested objects and valid/invalid key paths
    - Assert `lookupKey()` returns correct value for valid paths and null for invalid paths
    - **Validates: Requirements 1.2, 4.1**

  - [x] 1.8 Write property test for translation fallback chain (Property 3)
    - **Property 3: 翻译回退链完整性**
    - Generate I18nConfig with varying key presence across locales
    - Assert correct fallback behavior: current locale → default locale → key itself
    - **Validates: Requirements 4.3, 4.4**

  - [x] 1.9 Write property test for string interpolation (Property 4)
    - **Property 4: 字符串插值完备性**
    - Generate template strings with `{placeholder}` patterns and params objects
    - Assert all present params are substituted and missing params are preserved
    - **Validates: Requirements 4.2, 4.5**

- [x] 2. Implement LocaleDetector module (`src/locale-detector.ts`)
  - [x] 2.1 Create `src/locale-detector.ts` with type definitions (`LocaleSources`, `LocaleResult`, `SupportedLocales`)
    - Define `LocaleSources` interface with optional fields: `cliLang`, `configLang`, `envLang`, `systemLocale`
    - Define `LocaleResult` interface with `locale`, `source`, and optional `warning`
    - Define `SupportedLocales` as `ReadonlySet<string>`
    - _Requirements: 2.1_

  - [x] 2.2 Implement `normalizeLocale()` pure function
    - Strip region codes (e.g., `zh_CN` → `zh`), encoding suffixes (`.UTF-8`), and variant tags
    - Handle edge cases: empty string, already-normalized values, uppercase variants
    - _Requirements: 2.4, 8.2_

  - [x] 2.3 Implement `detectLocale()` pure function with priority chain
    - Check sources in order: `cliLang` > `configLang` > `envLang` > `systemLocale` > default
    - Apply `normalizeLocale()` to each source value before checking support
    - Return default locale with warning when detected locale is unsupported
    - Skip empty/undefined sources
    - _Requirements: 2.1, 2.2, 2.3, 8.2_

  - [x] 2.4 Write property test for locale priority resolution (Property 5)
    - **Property 5: 语言优先级解析正确性**
    - Generate `LocaleSources` with random combinations of present/absent values
    - Assert highest-priority supported source wins
    - **Validates: Requirements 2.1, 2.2**

  - [x] 2.5 Write property test for locale normalization idempotency (Property 6)
    - **Property 6: Locale 规范化幂等性**
    - Generate raw locale strings with region/encoding/variant suffixes
    - Assert `normalizeLocale(normalizeLocale(x)) === normalizeLocale(x)`
    - **Validates: Requirements 2.4**

  - [x] 2.6 Write property test for unsupported locale fallback (Property 7)
    - **Property 7: 不支持的语言回退**
    - Generate locale strings not in supported set
    - Assert result is default locale with warning present
    - **Validates: Requirements 2.3**

- [x] 3. Checkpoint - Core pure function modules
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement SkillResolver module (`src/skill-resolver.ts`)
  - [x] 4.1 Create `src/skill-resolver.ts` with type definitions (`SkillResolution`)
    - Define `SkillResolution` interface with `filePath`, `isFallback`, `resolvedLocale`
    - _Requirements: 5.1_

  - [x] 4.2 Implement `buildSkillCandidates()` pure function
    - Return `["skills/{name}/SKILL.{locale}.md", "skills/{name}/SKILL.md"]` for non-default locale
    - Return `["skills/{name}/SKILL.md"]` when locale equals defaultLocale
    - _Requirements: 5.1, 5.2_

  - [x] 4.3 Implement `resolveSkillFile()` pure function with injected `existsCheck`
    - Iterate candidates, return first existing path with `isFallback: false`
    - If no candidate exists, return default `SKILL.md` path with `isFallback: true`
    - _Requirements: 5.1, 5.2_

  - [x] 4.4 Implement `validateSkillName()` function
    - Compare frontmatter `name` field with directory name
    - Return boolean indicating consistency
    - _Requirements: 5.4_

  - [x] 4.5 Write property test for SKILL file resolution and fallback (Property 8)
    - **Property 8: SKILL 文件解析与回退**
    - Generate skill names and locales, verify candidate ordering and fallback behavior
    - Assert locale-specific path appears before default path in candidates
    - **Validates: Requirements 5.1, 5.2**

- [x] 5. Implement ConfigStore module (`src/config-store.ts`)
  - [x] 5.1 Create `src/config-store.ts` with `extractConfigLang()` function
    - Reuse `parseFrontmatter()` and `extractStringField()` from `src/frontmatter.ts`
    - Return `lang` field value or null if missing/no frontmatter
    - _Requirements: 6.1_

  - [x] 5.2 Implement `writeConfigLang()` pure function
    - Update existing `lang` field in frontmatter if present
    - Add `lang` field to frontmatter if not present
    - Create full frontmatter structure if content has no frontmatter
    - Preserve all other existing frontmatter fields unchanged
    - _Requirements: 6.1, 6.2, 6.4_

  - [x] 5.3 Implement `buildDefaultConfig()` function
    - Generate default config.md content with frontmatter containing `lang` field
    - _Requirements: 6.3_

  - [x] 5.4 Write property test for config lang round-trip and field preservation (Property 9)
    - **Property 9: Config lang 字段往返与字段保留**
    - Generate config.md content with arbitrary frontmatter fields and locale strings
    - Assert `extractConfigLang(writeConfigLang(content, lang)) === lang`
    - Assert other frontmatter fields are preserved unchanged
    - **Validates: Requirements 6.1, 6.4**

- [x] 6. Checkpoint - All pure function modules complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Create translation files
  - [x] 7.1 Create `locales/en.json` with all English translation keys
    - Include all user-visible strings from `src/forge-loop-cli.ts` (errors, warnings, status output)
    - Include strings from `src/run-manager.ts` and `src/sdk-driver.ts` console output
    - Use nested structure with dot-separated key paths (e.g., `cli.error.notGitRepo`)
    - Use `{paramName}` placeholder syntax for dynamic values
    - _Requirements: 1.1, 7.1, 7.2_

  - [x] 7.2 Create `locales/zh.json` with all Chinese translation keys
    - Mirror the exact same key structure as `en.json`
    - Translate all user-visible strings to Chinese
    - Preserve `{paramName}` placeholders unchanged
    - _Requirements: 1.1, 7.1, 7.2_

  - [x] 7.3 Write smoke test verifying key parity between en.json and zh.json
    - Assert both files have identical key structures
    - Assert internal debug/log strings are not present in translation files
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 8. CLI integration — add `--lang` option to `src/forge-loop-cli.ts`
  - [x] 8.1 Add `--lang <locale>` option to Commander program definition
    - Add option after existing options, mark as optional
    - Define `SUPPORTED_LOCALES` constant as `ReadonlySet<string>` with `"zh"` and `"en"`
    - _Requirements: 3.1, 9.4_

  - [x] 8.2 Add `--lang` validation and locale detection in action callback
    - Validate `--lang` value against `SUPPORTED_LOCALES`, throw `CliError` with valid options list on invalid value
    - Read `.forge/config.md` lang field via `extractConfigLang()`
    - Call `detectLocale()` with all sources (CLI arg, config, `process.env.FORGE_LANG`, `process.env.LANG || process.env.LC_ALL`)
    - Load translation files and create `I18nConfig`
    - _Requirements: 2.1, 3.1, 3.2, 3.3, 9.1_

  - [x] 8.3 Write unit tests for `--lang` CLI option
    - Test valid `--lang` values are accepted
    - Test invalid `--lang` value outputs valid options and rejects startup
    - Test missing `--lang` delegates to LocaleDetector
    - Test existing CLI options remain unchanged
    - _Requirements: 3.1, 3.2, 3.3, 9.4_

- [x] 9. Source code string extraction
  - [x] 9.1 Replace hardcoded user-visible strings in `src/forge-loop-cli.ts` with `t()` calls
    - Replace all `CliError` message strings with `t("cli.error.*", params)` calls
    - Replace `console.warn` user-visible messages with `t("cli.warning.*", params)` calls
    - Replace `console.log` status messages with `t("cli.loop.*", params)` calls
    - Keep internal debug/log messages in English unchanged
    - _Requirements: 7.1, 7.3_

  - [x] 9.2 Replace hardcoded user-visible strings in `src/run-manager.ts` and `src/sdk-driver.ts`
    - Replace `console.log` / `console.warn` / `console.error` user-visible output with `t()` calls
    - Pass `I18nConfig` or `t` function to modules that need translation
    - Keep internal logging and debug output in English
    - _Requirements: 7.2, 7.3_

- [x] 10. SKILL.md multi-language support integration
  - [x] 10.1 Integrate `resolveSkillFile()` into skill loading path
    - Wire `SkillResolver` into the existing skill loading code
    - Pass current locale from `I18nConfig` to skill resolution
    - Use `parseFrontmatter()` to validate frontmatter `name` field consistency
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 10.2 Write unit tests for SKILL.md multi-language loading
    - Test locale-specific SKILL file is loaded when available
    - Test fallback to default SKILL.md when locale version missing
    - Test frontmatter name validation against directory name
    - _Requirements: 5.1, 5.2, 5.4_

- [x] 11. Final checkpoint - Full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 9 universal correctness properties defined in the design document
- Unit tests validate specific examples, edge cases, and error conditions
- All modules follow the pure function pattern — I/O is confined to the CLI entry point adapter layer
- No new runtime dependencies are introduced (Requirements 9.2)
