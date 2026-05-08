/**
 * Plan engine — core validation logic extracted from forge-plan/SKILL.md.
 *
 * Implements Plan task validation:
 *   - validateAtomicTask:  Validates a single atomic task has all required fields
 *   - scanForPlaceholders: Scans text for forbidden placeholder content
 *   - validatePlanTasks:   Validates all tasks in a plan (full format)
 *   - validateLightweightTask / validateLightweightPlan: Lightweight format validation
 *   - detectPlanFormat:    Detects plan format from frontmatter
 *   - validatePlan:        Unified dispatcher that routes to the correct validator
 *
 * Per SKILL.md §3, each atomic task must contain:
 *   - Task number, title, file path
 *   - TDD steps (RED/GREEN/REFACTOR)
 *   - Estimated time (2-5 minutes)
 *   - Verify command, commit message
 *   - No forbidden placeholders
 *
 * Per SKILL.md §4, forbidden placeholders:
 *   TBD, TODO, 待定, 后续补充, 类似 Task, 添加适当的错误处理
 */
import type { Glossary, GlossaryTerm } from "./glossary.js";
/** @public */
export interface TDDSteps {
    red: {
        testFile: string;
        testCode: string;
        runCommand: string;
    };
    green: {
        sourceFile: string;
        sourceCode: string;
        runCommand: string;
    };
    refactor: string;
}
/** @public */
export interface AtomicTask {
    taskNumber: number;
    title: string;
    filePath: string;
    estimatedMinutes: number;
    tddSteps: TDDSteps;
    verifyCommand: string;
    commitMessage: string;
    dependsOn?: number[];
}
/** @public */
export type PlanFormat = "lightweight" | "full";
/** @public */
export interface LightweightTask {
    taskNumber: number;
    title: string;
    filePath: string;
    goal: string;
    designReference: string;
    propertyRef?: number;
    verifyCommand: string;
    commitMessage: string;
    dependsOn?: number[];
}
/** @public */
export interface DesignReferenceEntry {
    anchor: string;
    summary: string;
}
/** @public */
export interface DesignReferenceValidation {
    valid: boolean;
    errors: string[];
}
/** @public */
export declare const FORBIDDEN_PLACEHOLDERS: string[];
/**
 * Scan a text string for forbidden placeholder content.
 *
 * Per SKILL.md §4, the scan is case-insensitive and matches exact text
 * and common variants (e.g., `tbd`, `Todo`, `TODO:`, `// TODO`).
 *
 * Returns an array of found placeholder strings. Empty array means clean.
 * @public
 */
export declare function scanForPlaceholders(text: string): string[];
/**
 * Validate a single atomic task.
 *
 * Checks:
 *   (a) All required fields are present and non-empty
 *   (b) Estimated time is between 2 and 5 minutes
 *   (c) No forbidden placeholders in any text field
 *   (d) Referenced types/functions consistency (checked at plan level)
 *
 * Returns { valid, errors } where errors lists all validation failures.
 * @public
 */
export declare function validateAtomicTask(task: AtomicTask): {
    valid: boolean;
    errors: string[];
};
/**
 * Validate that the associated spec is in "locked" status before plan execution.
 *
 * Per R24: Plan execution requires a locked spec to ensure the plan is based
 * on a confirmed specification.
 * @public
 */
export declare function validateSpecLocked(specStatus: string): {
    valid: true;
} | {
    valid: false;
    error: string;
};
/**
 * Validate that all `dependsOn` references in a task list point to existing
 * `taskNumber` values.
 *
 * Per R25: Each task's `dependsOn` array (if present) must only reference
 * task numbers that exist in the plan.
 * @public
 */
export declare function validateDependencies(tasks: Array<{
    taskNumber: number;
    dependsOn?: number[];
}>): string[];
/**
 * Validate all tasks in a plan.
 *
 * Returns true only if every task passes validateAtomicTask and all
 * `dependsOn` references are valid.
 * @public
 */
export declare function validatePlanTasks(tasks: AtomicTask[]): boolean;
/** @public */
export declare function detectPlanFormat(frontmatter: string): PlanFormat;
/** @public */
export declare function extractHeadingAnchors(markdownContent: string): string[];
/** @public */
export declare function validateLightweightTask(task: LightweightTask): {
    valid: boolean;
    errors: string[];
};
/** @public */
export declare function validateLightweightPlan(tasks: LightweightTask[]): boolean;
/** @public */
export declare function validateDesignReferences(references: string[], designContent: string): DesignReferenceValidation;
/** @public */
export declare function validatePlan(frontmatter: string, tasks: AtomicTask[] | LightweightTask[], designContent?: string): {
    valid: boolean;
    errors: string[];
    format: PlanFormat;
};
/**
 * Normalize domain terminology inside a task title string.
 *
 * For each alias (and canonical term) defined in the glossary, this
 * function finds case-insensitive whole-word matches inside `title` and
 * replaces them with the canonical `term` form. When multiple surface
 * forms could match the same region, the longest surface wins (greedy).
 *
 * Guarantees:
 *   - Matches are case-insensitive but the canonical form is written
 *     verbatim (preserving the glossary's chosen casing).
 *   - Surrounding text is unchanged; only the matched spans are rewritten.
 *   - Partial matches inside a larger word are never replaced (e.g. an
 *     alias "档位" will not touch "档位选择器").
 *   - The function is pure: same inputs yield the same output.
 *   - The operation is idempotent: applying it twice gives the same result
 *     as applying it once, because canonical terms already normalize to
 *     themselves.
 *
 * **Validates: Requirements 1.5**
 *
 * @public
 */
export declare function normalizeTaskTerms(title: string, glossary: Glossary): string;
/**
 * Return a copy of `task` whose `title` field has been normalized against
 * the glossary. All other fields are passed through unchanged.
 * @public
 */
export declare function normalizeLightweightTask(task: LightweightTask, glossary: Glossary): LightweightTask;
/**
 * Return a copy of `task` whose `title` field has been normalized against
 * the glossary. All other fields are passed through unchanged.
 * @public
 */
export declare function normalizeAtomicTask(task: AtomicTask, glossary: Glossary): AtomicTask;
export type { Glossary, GlossaryTerm };
