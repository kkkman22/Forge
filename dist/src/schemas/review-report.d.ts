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
/** Any accepted outcome string. `incomplete` is the safe default. */
export declare const ReviewResultSchema: z.ZodString;
/** Severity counts must be non-negative integers. */
export declare const SeverityCountSchema: z.ZodNumber;
export declare const ReviewReportSchema: z.ZodObject<{
    result: z.ZodOptional<z.ZodString>;
    p0_count: z.ZodOptional<z.ZodNumber>;
    p1_count: z.ZodOptional<z.ZodNumber>;
    p2_count: z.ZodOptional<z.ZodNumber>;
    p3_count: z.ZodOptional<z.ZodNumber>;
}, z.core.$loose>;
export type ReviewReport = z.infer<typeof ReviewReportSchema>;
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
export declare function safeParseReviewReport(raw: unknown): SafeParseReviewResult;
