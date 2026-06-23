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

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

/** Project security level, 0 (minimum) through 3 (strict). */
export const SecurityLevelSchema = z.number().int().min(0).max(3);

/** Knowledge-library cap per category. */
export const KnowledgeLimitSchema = z.number().int().positive();

// ---------------------------------------------------------------------------
// Top-level schema
// ---------------------------------------------------------------------------

export const ConfigFileSchema = z
  .object({
    project: z.string().optional(),
    stack: z.array(z.string()).optional(),
    security_level: SecurityLevelSchema.optional(),
    knowledge_limit: KnowledgeLimitSchema.optional(),
    max_parallel_agents: z.number().int().min(1).max(10).optional(),
    restatement_interval: z.number().int().min(2).max(10).optional(),
    event_log_retention_days: z.number().int().positive().optional(),
    max_subagent_depth: z.number().int().min(1).max(10).optional(),
    destructive_guard: z.enum(["on", "off"]).optional(),
  })
  .passthrough();

export type ConfigFile = z.infer<typeof ConfigFileSchema>;

// ---------------------------------------------------------------------------
// Lenient parsing
// ---------------------------------------------------------------------------

export interface SafeParseConfigResult {
  value: Partial<ConfigFile>;
  errors: string[];
}

/**
 * Parse a raw frontmatter object against `ConfigFileSchema` without
 * throwing. Invalid fields are dropped from the returned `value`; the
 * corresponding errors appear in `errors`.
 */
export function safeParseConfigFile(raw: unknown): SafeParseConfigResult {
  const result = ConfigFileSchema.safeParse(raw);
  if (result.success) {
    return { value: result.data, errors: [] };
  }

  const errors = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);

  const partial: Record<string, unknown> = {};
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    const rawObj = raw as Record<string, unknown>;
    for (const [key, value] of Object.entries(rawObj)) {
      const fieldSchema = FIELD_SCHEMAS[key];
      if (fieldSchema === undefined) {
        partial[key] = value;
        continue;
      }
      const fieldResult = fieldSchema.safeParse(value);
      if (fieldResult.success) {
        partial[key] = fieldResult.data;
      }
    }
  }
  return { value: partial as Partial<ConfigFile>, errors };
}

const FIELD_SCHEMAS: Record<string, z.ZodTypeAny> = {
  project: z.string(),
  stack: z.array(z.string()),
  security_level: SecurityLevelSchema,
  knowledge_limit: KnowledgeLimitSchema,
  max_parallel_agents: z.number().int().min(1).max(10),
  restatement_interval: z.number().int().min(2).max(10),
  event_log_retention_days: z.number().int().positive(),
  max_subagent_depth: z.number().int().min(1).max(10),
  destructive_guard: z.enum(["on", "off"]),
};
