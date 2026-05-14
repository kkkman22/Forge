/**
 * Zod schema for plan frontmatter.
 *
 * Captures the well-known fields that callers read from `.forge/plans/*.md`:
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
export declare const PlanFormatSchema: z.ZodEnum<{
    full: "full";
    lightweight: "lightweight";
}>;
export declare const PlanStatusSchema: z.ZodString;
export declare const ContextFilesSchema: z.ZodArray<z.ZodString>;
export declare const PlanFileSchema: z.ZodObject<{
    format: z.ZodOptional<z.ZodEnum<{
        full: "full";
        lightweight: "lightweight";
    }>>;
    status: z.ZodOptional<z.ZodString>;
    context_files: z.ZodOptional<z.ZodArray<z.ZodString>>;
    task: z.ZodOptional<z.ZodString>;
    date: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
export type PlanFile = z.infer<typeof PlanFileSchema>;
export interface SafeParsePlanResult {
    value: Partial<PlanFile>;
    errors: string[];
}
export declare function safeParsePlanFile(raw: unknown): SafeParsePlanResult;
