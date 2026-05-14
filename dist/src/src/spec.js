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
import { DEFAULT_EXTRACTION_RULES, extractCandidates, filterCandidates, } from "./glossary-extractor.js";
<<<<<<< HEAD
export { renderGlossaryConflictPrompt, runGlossaryCheck } from "./glossary-hook.js";
=======
>>>>>>> origin/main
export { detectSpecLeak, loadBannedPatterns } from "./spec-leak-detector.js";
// ---------------------------------------------------------------------------
// Spec lifecycle functions
// ---------------------------------------------------------------------------
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
export function confirmSpec(spec) {
    const errors = [];
    if (!validateTestability(spec.requirements)) {
        errors.push("Not all requirements have testable scenarios");
    }
    if (spec.isBrownfield && !validateBrownfieldDelta(spec)) {
        errors.push("Brownfield spec missing complete Delta section");
    }
    if (errors.length > 0) {
        return { success: false, errors };
    }
    return {
        success: true,
        spec: {
            ...spec,
            frontmatter: {
                ...spec.frontmatter,
                status: "locked",
            },
        },
    };
}
/**
 * Reject a Spec document.
 *
 * Returns a new SpecDocument with status kept as "draft".
 * Per SKILL.md §2 Step 3, rejection keeps the spec in draft state.
 */
export function rejectSpec(spec) {
    return {
        ...spec,
        frontmatter: {
            ...spec.frontmatter,
            status: "draft",
        },
    };
}
/**
 * Create an imported Spec document from external source.
 *
 * Wraps externally-sourced requirements into a SpecDocument with importSource
 * tracking. Used when a developer provides a PM spec via `/forge spec <file>`.
 */
export function createImportedSpec(feature, date, purpose, requirements, exclusions, importSource, isBrownfield, delta) {
    return {
        frontmatter: {
            feature,
            status: "draft",
            date,
            importSource,
        },
        purpose,
        requirements,
        exclusions,
        isBrownfield,
        delta,
    };
}
// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------
/**
 * Validate that every requirement has at least one testable scenario.
 *
 * Per SKILL.md §4.1, each scenario must use the "当...则..." format.
 * Returns true if ALL requirements have ≥1 scenario matching the pattern.
 */
export function validateTestability(requirements) {
    if (requirements.length === 0) {
        return false;
    }
    const scenarioPattern = /当.+则.+/;
    return requirements.every((req) => req.scenarios.length > 0 && req.scenarios.some((s) => scenarioPattern.test(s)));
}
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
export function validateBrownfieldDelta(spec) {
    if (!spec.isBrownfield) {
        return true; // Non-brownfield specs don't need Delta
    }
    if (!spec.delta) {
        return false; // Brownfield spec missing Delta section entirely
    }
    // All three subsections must exist and have at least one entry
    return (spec.delta.added.length > 0 && spec.delta.modified.length > 0 && spec.delta.unchanged.length > 0);
}
// ---------------------------------------------------------------------------
// Glossary-miss detection
// ---------------------------------------------------------------------------
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
export function specTextFromDocument(spec) {
    const parts = [];
    if (spec.purpose.length > 0) {
        parts.push(spec.purpose);
    }
    for (const req of spec.requirements) {
        if (req.title.length > 0)
            parts.push(req.title);
        if (req.description.length > 0)
            parts.push(req.description);
        for (const scenario of req.scenarios) {
            if (scenario.length > 0)
                parts.push(scenario);
        }
    }
    for (const exclusion of spec.exclusions) {
        if (exclusion.length > 0)
            parts.push(exclusion);
    }
    if (spec.delta !== undefined) {
        for (const entry of spec.delta.added) {
            if (entry.length > 0)
                parts.push(entry);
        }
        for (const entry of spec.delta.modified) {
            if (entry.length > 0)
                parts.push(entry);
        }
        for (const entry of spec.delta.unchanged) {
            if (entry.length > 0)
                parts.push(entry);
        }
    }
    return parts.join("\n");
}
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
export function detectGlossaryMiss(specText, glossaryTerms) {
    const raw = extractCandidates(specText, glossaryTerms);
    return filterCandidates(raw, DEFAULT_EXTRACTION_RULES);
}
/**
 * Render the `[glossary-miss]` notice line displayed at the end of spec
 * output when the glossary does not yet define every surfaced term.
 *
 * Returns the empty string when `missed` is empty so callers can unconditionally
 * concatenate the notice without inserting a stray blank line.
 */
export function renderGlossaryMissNotice(missed) {
    if (missed.length === 0)
        return "";
    const terms = missed.map((c) => c.term).join(", ");
    return `[glossary-miss] 未定义术语：[${terms}]`;
}
// ---------------------------------------------------------------------------
// Business-analyst parallel triggering
// ---------------------------------------------------------------------------
/**
 * Collect the union of `core_subdomains` declared across all enabled packs.
 *
 * Each pack's `featureFlags.core_subdomains` is expected to be a `string[]`
 * when present. Packs that omit the flag (or set it to a non-array value) are
 * treated as contributing an empty set. The result is deduplicated.
 *
 * This function is pure.
 */
export function getCoreSubdomains(enabledPacks) {
    const result = [];
    for (const pack of enabledPacks) {
        const subdomains = pack.featureFlags?.core_subdomains;
        if (Array.isArray(subdomains)) {
            result.push(...subdomains);
        }
    }
    return [...new Set(result)];
}
/**
 * Determine whether the business-analyst subagent should be triggered in
 * parallel during the spec phase.
 *
 * Returns `true` when `currentContext` is defined and appears in the union
 * of core subdomains collected from the enabled packs.
 *
 * This function is pure.
 */
export function shouldTriggerBusinessAnalyst(currentContext, enabledPacks) {
    if (!currentContext)
        return false;
    const coreSubdomains = getCoreSubdomains(enabledPacks);
    return coreSubdomains.includes(currentContext);
}
//# sourceMappingURL=spec.js.map