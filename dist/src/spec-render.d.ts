/**
 * Three-file markdown renderers — pure functions.
 *
 * renderRequirementsMarkdown / renderDesignMarkdown / renderTasksMarkdown.
 * Each takes a typed document and returns markdown text.
 *
 * Validates: Requirement 1
 */
import type { DesignDocument, RequirementsDocument, TasksSeedDocument } from "./spec-bundle.js";
export declare function renderRequirementsMarkdown(doc: RequirementsDocument): string;
export declare function renderDesignMarkdown(doc: DesignDocument): string;
export declare function renderTasksMarkdown(doc: TasksSeedDocument): string;
