/**
 * Zod schema for `.tinkerman/specs/<feature>/spec.md` frontmatter.
 *
 * Mirrors `SpecFrontmatter` in `src/spec.ts`:
 *
 *   - `feature`:      required non-empty string (the feature slug)
 *   - `status`:       `"draft"` | `"locked"`
 *   - `date`:         required string (ISO date or free-form date)
 *   - `importSource`: optional path set when the spec is imported from
 *                     an external document (`.tinkerman/inbox/`)
 *
 * Uses `.passthrough()` to allow future fields without breaking parse.
 *
 * **Validates: Requirements 2.8, 2.9**
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

export const SpecStatusSchema = z.enum(["draft", "locked"]);

// ---------------------------------------------------------------------------
// Top-level schema
// ---------------------------------------------------------------------------

export const SpecFileSchema = z
  .object({
    feature: z.string().min(1).optional(),
    status: SpecStatusSchema.optional(),
    date: z.string().min(1).optional(),
    importSource: z.string().min(1).optional(),
  })
  .passthrough();

export type SpecFile = z.infer<typeof SpecFileSchema>;

// ---------------------------------------------------------------------------
// Lenient parsing
// ---------------------------------------------------------------------------

export interface SafeParseSpecResult {
  value: Partial<SpecFile>;
  errors: string[];
}

export function safeParseSpecFile(raw: unknown): SafeParseSpecResult {
  const result = SpecFileSchema.safeParse(raw);
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
  return { value: partial as Partial<SpecFile>, errors };
}

const FIELD_SCHEMAS: Record<string, z.ZodTypeAny> = {
  feature: z.string().min(1),
  status: SpecStatusSchema,
  date: z.string().min(1),
  importSource: z.string().min(1),
};
