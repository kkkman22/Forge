/**
 * Review spec router — builds review context from SpecBundle.
 *
 * For three-file layout: references requirements/design/tasks separately.
 * For legacy-single: references spec.md only.
 * For bugfix: references bugfix/design/tasks.
 *
 * Validates: Requirement 6
 */
import type { EarsClause, SpecBundle } from "./spec-bundle.js";
export interface SpecReference {
    file: string;
    role: string;
}
export interface ReviewSpecContext {
    layout: "three-file" | "legacy-single";
    kind: "feature" | "bugfix";
    specReferences: SpecReference[];
    earsCriteria: EarsClause[];
    taskIds: string[];
    promptSnippet: string;
}
/**
 * Build review context from a SpecBundle.
 * Used by review subagents (spec-check, quality-check, security-check)
 * to reference the correct spec files.
 */
export declare function buildReviewSpecContext(bundle: SpecBundle): ReviewSpecContext;
