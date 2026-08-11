/**
 * Zod schema for plan frontmatter.
 *
 * Captures the well-known fields that callers read from `.tinkerman/plans/*.md`:
 *
 *   - `format`:        `"full"` | `"lightweight"` — chooses the validator
 *   - `status`:        `"draft"` | `"approved"` | similar lifecycle string
 *   - `context_files`: list of file paths referenced during build
 *
 * Unknown fields pass through. Callers that only care about `format` can
 * still read `plan.format` and ignore the rest.
 *
 * **Validates: Requirements 2.8, 2.9**
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

export const PlanFormatSchema = z.enum(["full", "lightweight"]);

export const PlanStatusSchema = z.string().min(1);

export const ContextFilesSchema = z.array(z.string().min(1));

// ---------------------------------------------------------------------------
// Top-level schema
// ---------------------------------------------------------------------------

export const PlanFileSchema = z
  .object({
    format: PlanFormatSchema.optional(),
    status: PlanStatusSchema.optional(),
    context_files: ContextFilesSchema.optional(),
    task: z.string().optional(),
    date: z.string().optional(),
  })
  .passthrough();

export type PlanFile = z.infer<typeof PlanFileSchema>;

// ---------------------------------------------------------------------------
// Lenient parsing
// ---------------------------------------------------------------------------

export interface SafeParsePlanResult {
  value: Partial<PlanFile>;
  errors: string[];
}

export function safeParsePlanFile(raw: unknown): SafeParsePlanResult {
  const result = PlanFileSchema.safeParse(raw);
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
  return { value: partial as Partial<PlanFile>, errors };
}

const FIELD_SCHEMAS: Record<string, z.ZodTypeAny> = {
  format: PlanFormatSchema,
  status: PlanStatusSchema,
  context_files: ContextFilesSchema,
  task: z.string(),
  date: z.string(),
};
