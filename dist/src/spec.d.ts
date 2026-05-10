/**
 * Spec engine — core logic extracted from forge-spec/SKILL.md.
 *
 * Implements the Spec lifecycle:
 *   - confirmSpec:  Transitions a draft Spec to "locked" status
 *   - rejectSpec:   Keeps a Spec in "draft" status (no-op on status)
 *   - validateTestability: Ensures every requirement has ≥1 testable scenario
 *   - validateBrownfieldDelta: Ensures brownfield Specs contain a complete Delta section
 *   - detectGlossaryMiss: Surfaces spec terms that are not yet defined in the glossary
 *
 * Spec document format (from SKILL.md §3):
 *   YAML frontmatter: feature, status ("draft" | "locked"), date
 *   Body: 目的, 需求 (with 当...则... scenarios), 不做什么, Delta (brownfield only)
 */
import { type TermCandidate } from "./glossary-extractor.js";
export { detectSpecLeak, loadBannedPatterns } from "./spec-leak-detector.js";
export interface SpecFrontmatter {
    feature: string;
    status: "draft" | "locked";
    date: string;
    /** External spec source path (import mode only). */
    importSource?: string;
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
export type ConfirmSpecResult = {
    success: true;
    spec: SpecDocument;
} | {
    success: false;
    errors: string[];
};
/**
 * Confirm (lock) a Spec document.
 *
 * Validates the spec before locking:
 *   1. All requirements must have testable scenarios (validateTestability)
 *   2. Brownfield specs must have a complete Delta section (validateBrownfieldDelta)
 *
 * Returns a success result with the locked SpecDocument, or a failure result
 * with validation error messages.
 *
 * Per SKILL.md §2 Step 3, user confirmation transitions draft → locked.
 */
export declare function confirmSpec(spec: SpecDocument): ConfirmSpecResult;
/**
 * Reject a Spec document.
 *
 * Returns a new SpecDocument with status kept as "draft".
 * Per SKILL.md §2 Step 3, rejection keeps the spec in draft state.
 */
export declare function rejectSpec(spec: SpecDocument): SpecDocument;
/**
 * Create an imported Spec document from external source.
 *
 * Wraps externally-sourced requirements into a SpecDocument with importSource
 * tracking. Used when a developer provides a PM spec via `/forge spec <file>`.
 */
export declare function createImportedSpec(feature: string, date: string, purpose: string, requirements: Requirement[], exclusions: string[], importSource: string, isBrownfield: boolean, delta?: DeltaSection): SpecDocument;
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
/**
 * Serialize a SpecDocument's body text fields into a single string suitable
 * for term extraction. Includes the purpose, each requirement's title /
 * description / scenarios, the exclusions list, and (when present) every
 * Delta subsection entry.
 *
 * The serialization is intentionally simple — lines are joined with `\n`
 * and no additional markup is emitted. Callers that need a different
 * shape should build their own string; this helper exists so the common
 * case does not have to re-implement the traversal.
 *
 * This function is pure.
 */
export declare function specTextFromDocument(spec: SpecDocument): string;
/**
 * Identify candidate terms from a spec text that are not yet defined in
 * the glossary.
 *
 * Pipeline:
 *   1. {@link extractCandidates} surfaces TitleCase phrases, PascalCase
 *      identifiers, and Chinese multi-character sequences that do not
 *      appear in `glossaryTerms`.
 *   2. {@link filterCandidates} applies the default extraction rules so
 *      noise (camelCase locals, rare one-off terms) is removed and the
 *      result is capped at `DEFAULT_EXTRACTION_RULES.maxCandidatesPerSession`.
 *
 * `glossaryTerms` should include every term name AND every alias already
 * present in the glossary so aliased concepts are not reported as misses.
 *
 * Returns the filtered shortlist in the order produced by `filterCandidates`
 * (frequency desc, term asc). This function is pure and performs no IO.
 */
export declare function detectGlossaryMiss(specText: string, glossaryTerms: string[]): TermCandidate[];
/**
 * Render the `[glossary-miss]` notice line displayed at the end of spec
 * output when the glossary does not yet define every surfaced term.
 *
 * Returns the empty string when `missed` is empty so callers can unconditionally
 * concatenate the notice without inserting a stray blank line.
 */
export declare function renderGlossaryMissNotice(missed: TermCandidate[]): string;
/**
 * Collect the union of `core_subdomains` declared across all enabled packs.
 *
 * Each pack's `featureFlags.core_subdomains` is expected to be a `string[]`
 * when present. Packs that omit the flag (or set it to a non-array value) are
 * treated as contributing an empty set. The result is deduplicated.
 *
 * This function is pure.
 */
export declare function getCoreSubdomains(enabledPacks: Array<{
    featureFlags: Record<string, unknown>;
}>): string[];
/**
 * Determine whether the business-analyst subagent should be triggered in
 * parallel during the spec phase.
 *
 * Returns `true` when `currentContext` is defined and appears in the union
 * of core subdomains collected from the enabled packs.
 *
 * This function is pure.
 */
export declare function shouldTriggerBusinessAnalyst(currentContext: string | undefined, enabledPacks: Array<{
    featureFlags: Record<string, unknown>;
}>): boolean;
