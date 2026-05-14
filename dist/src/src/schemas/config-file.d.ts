/**
 * Zod schema for `.forge/config.md` frontmatter.
 *
 * Provides the runtime contract for project configuration. Matches the
 * legacy `parseConfigFileGraceful` / `loadConfig` shape so that callers
 * can migrate incrementally behind a feature flag (Requirement 2.8).
 *
 * **Validates: Requirements 2.4, 2.5**
 */
import { z } from "zod";
/** Project security level, 0 (minimum) through 3 (strict). */
export declare const SecurityLevelSchema: z.ZodNumber;
/** Knowledge-library cap per category. */
export declare const KnowledgeLimitSchema: z.ZodNumber;
export declare const ConfigFileSchema: z.ZodObject<{
    project: z.ZodOptional<z.ZodString>;
    stack: z.ZodOptional<z.ZodArray<z.ZodString>>;
    security_level: z.ZodOptional<z.ZodNumber>;
    knowledge_limit: z.ZodOptional<z.ZodNumber>;
    max_parallel_agents: z.ZodOptional<z.ZodNumber>;
    restatement_interval: z.ZodOptional<z.ZodNumber>;
    event_log_retention_days: z.ZodOptional<z.ZodNumber>;
}, z.core.$loose>;
export type ConfigFile = z.infer<typeof ConfigFileSchema>;
export interface SafeParseConfigResult {
    value: Partial<ConfigFile>;
    errors: string[];
}
/**
 * Parse a raw frontmatter object against `ConfigFileSchema` without
 * throwing. Invalid fields are dropped from the returned `value`; the
 * corresponding errors appear in `errors`.
 */
export declare function safeParseConfigFile(raw: unknown): SafeParseConfigResult;
