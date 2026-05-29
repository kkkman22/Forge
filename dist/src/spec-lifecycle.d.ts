/**
 * Spec lifecycle management module.
 *
 * Defines the spec status enum, frontmatter schema, parsing, and validation
 * for `.kiro/specs/` directory lifecycle management.
 *
 * **Validates: spec-lifecycle-management requirements 1, 2**
 */
/** Valid spec lifecycle statuses. */
export type SpecStatus = "draft" | "approved" | "in_progress" | "completed" | "deferred" | "archived";
/** Valid priority levels. */
export type SpecPriority = "P1" | "P2" | "P3";
/** Valid tier levels. */
export type SpecTier = "light" | "standard" | "full";
/** Parsed spec frontmatter from a requirements.md file. */
export interface SpecFrontmatter {
    /** Spec name in kebab-case. */
    name: string;
    /** Current lifecycle status. */
    status: SpecStatus;
    /** ISO date when the spec was created. */
    created: string;
    /** ISO date when the spec was last updated. */
    updated: string;
    /** Priority level (optional, defaults to P2). */
    priority?: SpecPriority;
    /** Tier level (optional). */
    tier?: SpecTier;
    /** Names of specs this spec depends on. */
    depends_on: string[];
    /** Names of specs this spec replaces. */
    replaces: string[];
    /** Names of specs that replace this spec. */
    replaced_by: string[];
    /** Required when status is deferred. */
    deferred_reason?: string;
    /** Required when status is deferred, ISO date. */
    deferred_date?: string;
}
/** Validation result for a SpecFrontmatter. */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}
/**
 * Parse spec frontmatter from a requirements.md content string.
 * Returns null if no valid frontmatter with a name field is found.
 */
export declare function parseSpecFrontmatter(content: string): SpecFrontmatter | null;
/**
 * Validate a SpecFrontmatter object against the schema.
 * Returns a ValidationResult with valid flag and any error messages.
 */
export declare function validateSpecFrontmatter(fm: SpecFrontmatter): ValidationResult;
