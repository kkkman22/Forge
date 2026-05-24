/**
 * Zod schema for `.forge/specs/<feature>/spec.md` frontmatter.
 *
 * Mirrors `SpecFrontmatter` in `src/spec.ts`:
 *
 *   - `feature`:      required non-empty string (the feature slug)
 *   - `status`:       `"draft"` | `"locked"`
 *   - `date`:         required string (ISO date or free-form date)
 *   - `importSource`: optional path set when the spec is imported from
 *                     an external document (`.forge/inbox/`)
 *
 * Uses `.passthrough()` to allow future fields without breaking parse.
 *
 * **Validates: Requirements 2.8, 2.9**
 */
import { z } from "zod";
export declare const SpecStatusSchema: z.ZodEnum<{
    locked: "locked";
    draft: "draft";
}>;
export declare const SpecFileSchema: z.ZodObject<{
    feature: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<{
        locked: "locked";
        draft: "draft";
    }>>;
    date: z.ZodOptional<z.ZodString>;
    importSource: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
export type SpecFile = z.infer<typeof SpecFileSchema>;
export interface SafeParseSpecResult {
    value: Partial<SpecFile>;
    errors: string[];
}
export declare function safeParseSpecFile(raw: unknown): SafeParseSpecResult;
