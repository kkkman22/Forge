import type { LintFinding } from "../pack/types.js";
export interface PackLintPattern {
    type: "regex";
    expression: string;
    message: string;
    fix_suggestion: string;
}
export interface PackLintRule {
    id: string;
    severity: "error" | "warn";
    description: string;
    target_globs: string[];
    patterns: PackLintPattern[];
    sourcePack: string;
    entryPath: string;
}
export declare function loadPackLintRules(packRootPath: string, manifestRelativePath: string): PackLintRule[];
export declare function applyLintRulesToFile(filePath: string, fileContent: string, rules: PackLintRule[]): LintFinding[];
