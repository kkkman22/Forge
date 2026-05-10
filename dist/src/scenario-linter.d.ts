/**
 * Scenario Linter - validates Gherkin scenario formatting rules.
 *
 * Enforces 4 default rules (SCN001-SCN004) and supports pack-provided
 * additional rules. Returns LintFinding array with file:line precision.
 *
 * Validates: R8.1-8.6 Scenario Linter
 */
import type { LintFinding } from "./pack/types.js";
/**
 * Lint Gherkin scenarios in spec text for formatting violations.
 *
 * @param specText - Full spec markdown content
 * @param filePath - File path for findings
 * @param options - Optional additional rules from packs
 * @returns Array of lint findings
 *
 * @example
 * ```ts
 * const findings = lintScenarios(specText, "spec.md");
 * const errors = findings.filter(f => f.severity === "error");
 * ```
 */
export declare function lintScenarios(specText: string, filePath: string, _options?: {
    additionalRules?: unknown[];
}): LintFinding[];
