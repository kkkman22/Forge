/**
 * Spec engine — core logic extracted from forge-spec/SKILL.md.
 *
 * Implements the Spec lifecycle:
 *   - confirmSpec:  Transitions a draft Spec to "locked" status
 *   - rejectSpec:   Keeps a Spec in "draft" status (no-op on status)
 *   - validateTestability: Ensures every requirement has ≥1 testable scenario
 *   - validateBrownfieldDelta: Ensures brownfield Specs contain a complete Delta section
 *
 * Spec document format (from SKILL.md §3):
 *   YAML frontmatter: feature, status ("draft" | "locked"), date
 *   Body: 目的, 需求 (with 当...则... scenarios), 不做什么, Delta (brownfield only)
 */
export interface SpecFrontmatter {
    feature: string;
    status: "draft" | "locked";
    date: string;
}
export interface Requirement {
    title: string;
    description: string;
    scenarios: string[];
}
export interface DeltaSection {
    added: string[];
    modified: string[];
    unchanged: string[];
}
export interface SpecDocument {
    frontmatter: SpecFrontmatter;
    purpose: string;
    requirements: Requirement[];
    exclusions: string[];
    delta?: DeltaSection;
    isBrownfield: boolean;
}
/**
 * Confirm (lock) a Spec document.
 *
 * Returns a new SpecDocument with status set to "locked".
 * Per SKILL.md §2 Step 3, user confirmation transitions draft → locked.
 */
export declare function confirmSpec(spec: SpecDocument): SpecDocument;
/**
 * Reject a Spec document.
 *
 * Returns a new SpecDocument with status kept as "draft".
 * Per SKILL.md §2 Step 3, rejection keeps the spec in draft state.
 */
export declare function rejectSpec(spec: SpecDocument): SpecDocument;
/**
 * Validate that every requirement has at least one testable scenario.
 *
 * Per SKILL.md §4.1, each scenario must use the "当...则..." format.
 * Returns true if ALL requirements have ≥1 scenario matching the pattern.
 */
export declare function validateTestability(requirements: Requirement[]): boolean;
/**
 * Validate that a brownfield Spec contains a complete Delta section.
 *
 * Per SKILL.md §4.3, brownfield Specs MUST have a Delta section with
 * three subsections: 新增 (added), 修改 (modified), 不变 (unchanged).
 * Each subsection must have at least one entry.
 *
 * Returns true if the spec is brownfield AND has a valid Delta section,
 * or if the spec is NOT brownfield (non-brownfield specs don't need Delta).
 */
export declare function validateBrownfieldDelta(spec: SpecDocument): boolean;
