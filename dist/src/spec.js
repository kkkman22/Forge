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
//# sourceMappingURL=spec.js.map