/**
 * Bugfix Spec — parser, renderer, self-checks.
 *
 * Validates: Requirement 14
 */
import type { BugfixDesignDocument, BugfixDocument, SpecBundle } from "./spec-bundle.js";
export interface ParseError {
    line?: number;
    message: string;
}
export interface ParseResult<T> {
    doc?: T;
    errors?: ParseError[];
}
export declare function parseBugfixMarkdown(text: string): ParseResult<BugfixDocument>;
export declare function parseBugfixDesignMarkdown(text: string): ParseResult<BugfixDesignDocument>;
export declare function renderBugfixMarkdown(doc: BugfixDocument): string;
export declare function renderBugfixDesignMarkdown(doc: BugfixDesignDocument): string;
export interface BugfixCheckFinding {
    rule: string;
    severity: "P0" | "P1";
    message: string;
}
export interface BugfixCheckResult {
    pass: boolean;
    findings: BugfixCheckFinding[];
}
export declare function runBugfixSelfChecks(bundle: SpecBundle): BugfixCheckResult;
