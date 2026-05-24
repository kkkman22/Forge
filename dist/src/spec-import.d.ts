/**
 * External spec import — parseSpecArgs, parseExternalSpec, scoreImportedContent, runImportMode.
 *
 * Validates: Requirement 10
 */
import type { EarsClause, WorkflowVariant } from "./spec-bundle.js";
export interface ParseSpecArgsResult {
    mode: "feature" | "import" | "default";
    feature?: string;
    path?: string;
}
export declare function parseSpecArgs(argv: string[]): ParseSpecArgsResult;
export interface ExternalSpecContent {
    purpose: string;
    earsCriteria: EarsClause[];
    nonFunctional: string[];
    outOfScope: string[];
}
export declare function parseExternalSpec(text: string): ExternalSpecContent;
export declare function scoreImportedContent(input: {
    earsCriteria: EarsClause[];
    hasArchitecture: boolean;
}): WorkflowVariant;
export interface ImportModeResult {
    success: boolean;
    feature: string;
    variant: WorkflowVariant;
    outputPath: string;
    error?: string;
}
/**
 * Import an external spec file and convert it into Forge three-file layout.
 * Returns the output directory path.
 */
export declare function runImportMode(inputPath: string, outputDir: string, eventsPath?: string): ImportModeResult;
