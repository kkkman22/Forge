/**
 * Three-file markdown parsers for Kiro-style spec layout.
 *
 * Pure functions: parseRequirementsMarkdown, parseDesignMarkdown, parseTasksMarkdown.
 * Each returns either a parsed document or a list of ParseError.
 *
 * Validates: Requirement 1
 */
import type { DesignDocument, RequirementsDocument, TasksSeedDocument } from "./spec-bundle.js";
export interface ParseError {
    line?: number;
    message: string;
}
export interface ParseResult<T> {
    doc?: T;
    errors?: ParseError[];
}
export declare function parseRequirementsMarkdown(text: string): ParseResult<RequirementsDocument>;
export declare function parseDesignMarkdown(text: string): ParseResult<DesignDocument>;
export declare function parseTasksMarkdown(text: string): ParseResult<TasksSeedDocument>;
