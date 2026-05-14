/**
 * Atomic rule loader for the `rules/` directory.
 *
 * Reads `rules/*.md` files, parses their frontmatter, and provides
 * helper for rendering suggestion suffix with lint_binding info.
 *
 * **Validates: Requirement R3.6**
 */
/** A single atomic rule from `rules/*.md`. */
export interface AtomicRule {
    /** Rule name from frontmatter. */
    name: string;
    /** Whether this rule always applies. */
    alwaysApply: boolean;
    /** Lint engine binding (null, string, or dual object). */
    lintBinding: string | {
        biome: string;
        eslint: string;
    } | null;
    /** Raw file content. */
    raw: string;
    /** Source file path. */
    filePath: string;
}
/**
 * Load all atomic rules from the `rules/` directory.
 *
 * Files with missing frontmatter fields are skipped with a warning
 * (no throw) [R3.8].
 */
export declare function loadAllRules(rulesDir?: string): Promise<AtomicRule[]>;
/**
 * Render a suggestion suffix referencing the lint rule binding.
 *
 * Returns empty string if the rule has no lint_binding.
 */
export declare function renderSuggestionSuffix(rule: AtomicRule): string;
