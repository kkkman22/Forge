/**
 * Zod schema for `.forge/status.md` frontmatter.
 *
 * Provides:
 *   - `StatusFileSchema` — the canonical runtime contract
 *   - `StatusFile` — the TypeScript type inferred from the schema
 *   - `safeParseStatusFile(raw)` — lenient parser that returns a partial
 *     result plus a list of human-readable field errors
 *
 * The schema is `.passthrough()` so unknown fields flow through without
 * error. This preserves backward compatibility with the pre-schema
 * parsers in `state.ts` (Requirement 2.7) and avoids breaking downstream
 * consumers that may have added custom fields.
 *
 * **Validates: Requirements 2.3, 2.5, 2.6, 2.7, 2.10**
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

export const PhaseSchema = z.enum([
  "decide",
  "spec",
  "plan",
  "build",
  "build-light",
  "review",
  "test",
  "ship",
  "learn",
  "debug",
  "fix",
  "refactor",
  "refactor-scan",
  "refactor-apply",
  "fix-analyze",
  "fix-apply",
]);

export const TierSchema = z.enum(["light", "standard", "full"]);

export const WorkNatureSchema = z.enum(["feature", "refactor", "bugfix"]);

export const LoopFieldsSchema = z
  .object({
    mode: z.enum(["interactive", "autonomous"]),
    loop_run_id: z.string(),
    loop_iteration: z.number().int().nonnegative(),
    skill_sequence: z.array(z.string()).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Top-level schema
// ---------------------------------------------------------------------------

export const StatusFileSchema = z
  .object({
    current_task: z.string().optional(),
    tier: TierSchema.optional(),
    task_type: z.string().optional(),
    project_phase: z.string().optional(),
    work_nature: WorkNatureSchema.optional(),
    phase: PhaseSchema.optional(),
    hints: z.string().optional(),
    assumptions: z.array(z.string()).optional(),
    updated: z.string().optional(),
    loop_fields: LoopFieldsSchema.optional(),
  })
  .passthrough();

export type StatusFile = z.infer<typeof StatusFileSchema>;

// ---------------------------------------------------------------------------
// Lenient parsing
// ---------------------------------------------------------------------------

/**
 * Result of a lenient `StatusFile` parse.
 *
 *  - `value`: best-effort partial extraction of known fields. When the
 *    input is a plain object, unknown / invalid fields are dropped;
 *    well-formed fields pass through.
 *  - `errors`: human-readable issue strings formatted as
 *    `"<field path>: <message>"`. Empty when the input validated fully.
 */
export interface SafeParseResult {
  value: Partial<StatusFile>;
  errors: string[];
}

/**
 * Parse a raw frontmatter object against `StatusFileSchema` without
 * throwing. Invalid fields are dropped from the returned `value`; the
 * corresponding errors appear in `errors`.
 *
 * This matches the semantics of the legacy `parseStatusFileGraceful`
 * helper in `state.ts` so that the new schema can be migrated behind a
 * feature flag without breaking callers (Requirement 2.8).
 */
export function safeParseStatusFile(raw: unknown): SafeParseResult {
  const result = StatusFileSchema.safeParse(raw);
  if (result.success) {
    return { value: result.data, errors: [] };
  }

  const errors = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);

  // Partial extraction: if the input is an object, keep every top-level
  // field that individually validates against its sub-schema.
  const partial: Record<string, unknown> = {};
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    const rawObj = raw as Record<string, unknown>;
    for (const [key, value] of Object.entries(rawObj)) {
      const fieldSchema = FIELD_SCHEMAS[key];
      if (fieldSchema === undefined) {
        // Unknown field — passthrough preserves it.
        partial[key] = value;
        continue;
      }
      const fieldResult = fieldSchema.safeParse(value);
      if (fieldResult.success) {
        partial[key] = fieldResult.data;
      }
    }
  }

  return { value: partial as Partial<StatusFile>, errors };
}

/**
 * Map of individual field schemas used by `safeParseStatusFile` for
 * partial extraction. Kept separate from the top-level schema so that the
 * partial path does not require the input to be globally valid.
 */
const FIELD_SCHEMAS: Record<string, z.ZodTypeAny> = {
  current_task: z.string(),
  tier: TierSchema,
  task_type: z.string(),
  project_phase: z.string(),
  work_nature: WorkNatureSchema,
  phase: PhaseSchema,
  hints: z.string(),
  assumptions: z.array(z.string()),
  updated: z.string(),
  loop_fields: LoopFieldsSchema,
};
