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
// ---------------------------------------------------------------------------
// Top-level schema
// ---------------------------------------------------------------------------
export const ReviewReportSchema = z
    .object({
    result: ReviewResultSchema.optional(),
    p0_count: SeverityCountSchema.optional(),
    p1_count: SeverityCountSchema.optional(),
    p2_count: SeverityCountSchema.optional(),
    p3_count: SeverityCountSchema.optional(),
})
    .passthrough();
/**
 * Parse a raw frontmatter object against `ReviewReportSchema` without
 * throwing. Invalid fields are dropped from the returned `value`; the
 * corresponding errors appear in `errors`.
 *
 * Matches the semantics of the legacy `parseReviewReportGraceful` helper
 * so that callers can migrate behind a feature flag without breaking.
 */
export function safeParseReviewReport(raw) {
    const result = ReviewReportSchema.safeParse(raw);
    if (result.success) {
        return { value: result.data, errors: [] };
    }
    const errors = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    const partial = {};
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
        const rawObj = raw;
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
    return { value: partial, errors };
}
const FIELD_SCHEMAS = {
    result: ReviewResultSchema,
    p0_count: SeverityCountSchema,
    p1_count: SeverityCountSchema,
    p2_count: SeverityCountSchema,
    p3_count: SeverityCountSchema,
};
//# sourceMappingURL=review-report.js.map