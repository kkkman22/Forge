/**
 * Zod schema for review report frontmatter.
 *
 * The review report summarises a `/forge review` run and gates ship. Its
 * shape mirrors `ReviewReportFields` in `src/state.ts`:
 *
 *   - `result`: lifecycle string (`pass`, `fail`, `incomplete`, etc.)
 *   - `p0_count`–`p3_count`: non-negative integer counts per severity
 *
 * Uses `.passthrough()` for forward compatibility with custom fields.
 *
 * **Validates: Requirements 2.8, 2.9**
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

/** Any accepted outcome string. `incomplete` is the safe default. */
export const ReviewResultSchema = z.string().min(1);

/** Severity counts must be non-negative integers. */
export const SeverityCountSchema = z.number().int().min(0);

/** Review report production methodology. */
export const MethodologySchema = z.enum([
  "saved-workflow",
  "subagent-parallel",
  "subagent-serial",
  "ci-evidence",
  "unavailable",
]);

export type Methodology = z.infer<typeof MethodologySchema>;

/** Runtime array of valid methodology values for legacy path validation. */
export const METHODOLOGY_VALUES = MethodologySchema.options as readonly Methodology[];

/** Default methodology when field is absent. */
export const METHODOLOGY_DEFAULT: Methodology = "subagent-parallel";

// ---------------------------------------------------------------------------
// Top-level schema
// ---------------------------------------------------------------------------

export const ReviewReportSchema = z
  .object({
    result: ReviewResultSchema.optional(),
    reviewed_at_commit: z.string().min(1).optional(),
    p0_count: SeverityCountSchema.optional(),
    p1_count: SeverityCountSchema.optional(),
    p2_count: SeverityCountSchema.optional(),
    p3_count: SeverityCountSchema.optional(),
    methodology: MethodologySchema.optional(),
  })
  .passthrough();

export type ReviewReport = z.infer<typeof ReviewReportSchema>;

// ---------------------------------------------------------------------------
// Lenient parsing
// ---------------------------------------------------------------------------

export interface SafeParseReviewResult {
  value: Partial<ReviewReport>;
  errors: string[];
}

/**
 * Parse a raw frontmatter object against `ReviewReportSchema` without
 * throwing. Invalid fields are dropped from the returned `value`; the
 * corresponding errors appear in `errors`.
 *
 * Matches the semantics of the legacy `parseReviewReportGraceful` helper
 * so that callers can migrate behind a feature flag without breaking.
 */
export function safeParseReviewReport(raw: unknown): SafeParseReviewResult {
  const result = ReviewReportSchema.safeParse(raw);
  const errors: string[] = [];

  if (result.success) {
    const value = { ...result.data };

    if (value.methodology === undefined) {
      value.methodology = METHODOLOGY_DEFAULT;
    }

    if (value.methodology === "unavailable" && value.result !== "blocked") {
      errors.push(
        `methodology=unavailable forces result=blocked (was ${JSON.stringify(value.result ?? null)})`,
      );
      value.result = "blocked";
    }

    return { value, errors };
  }

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
      } else if (key === "methodology") {
        partial.methodology = METHODOLOGY_DEFAULT;
        errors.push(`methodology field invalid: ${JSON.stringify(value)}`);
      } else {
        errors.push(`${key}: ${fieldResult.error.issues[0]?.message ?? "invalid"}`);
      }
    }
  }

  if (partial.methodology === undefined) {
    partial.methodology = METHODOLOGY_DEFAULT;
  }

  if (partial.methodology === "unavailable" && partial.result !== "blocked") {
    errors.push(
      `methodology=unavailable forces result=blocked (was ${JSON.stringify(partial.result ?? null)})`,
    );
    partial.result = "blocked";
  }

  return { value: partial as Partial<ReviewReport>, errors };
}

const FIELD_SCHEMAS: Record<string, z.ZodTypeAny> = {
  result: ReviewResultSchema,
  reviewed_at_commit: z.string().min(1),
  p0_count: SeverityCountSchema,
  p1_count: SeverityCountSchema,
  p2_count: SeverityCountSchema,
  p3_count: SeverityCountSchema,
  methodology: MethodologySchema,
};
