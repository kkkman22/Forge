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
export declare const PhaseSchema: z.ZodEnum<{
    spec: "spec";
    decide: "decide";
    plan: "plan";
    build: "build";
    "build-light": "build-light";
    review: "review";
    test: "test";
    ship: "ship";
    learn: "learn";
    debug: "debug";
    fix: "fix";
    refactor: "refactor";
}>;
export declare const TierSchema: z.ZodEnum<{
    standard: "standard";
    light: "light";
    full: "full";
}>;
export declare const LoopFieldsSchema: z.ZodObject<{
    mode: z.ZodEnum<{
        interactive: "interactive";
        autonomous: "autonomous";
    }>;
    loop_run_id: z.ZodString;
    loop_iteration: z.ZodNumber;
    skill_sequence: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export declare const StatusFileSchema: z.ZodObject<{
    current_task: z.ZodOptional<z.ZodString>;
    tier: z.ZodOptional<z.ZodEnum<{
        standard: "standard";
        light: "light";
        full: "full";
    }>>;
    task_type: z.ZodOptional<z.ZodString>;
    project_phase: z.ZodOptional<z.ZodString>;
    phase: z.ZodOptional<z.ZodEnum<{
        spec: "spec";
        decide: "decide";
        plan: "plan";
        build: "build";
        "build-light": "build-light";
        review: "review";
        test: "test";
        ship: "ship";
        learn: "learn";
        debug: "debug";
        fix: "fix";
        refactor: "refactor";
    }>>;
    hints: z.ZodOptional<z.ZodString>;
    assumptions: z.ZodOptional<z.ZodArray<z.ZodString>>;
    updated: z.ZodOptional<z.ZodString>;
    loop_fields: z.ZodOptional<z.ZodObject<{
        mode: z.ZodEnum<{
            interactive: "interactive";
            autonomous: "autonomous";
        }>;
        loop_run_id: z.ZodString;
        loop_iteration: z.ZodNumber;
        skill_sequence: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>;
}, z.core.$loose>;
export type StatusFile = z.infer<typeof StatusFileSchema>;
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
export declare function safeParseStatusFile(raw: unknown): SafeParseResult;
