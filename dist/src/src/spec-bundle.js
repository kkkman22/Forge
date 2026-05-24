/**
 * Spec Bundle — three-file layout data contract.
 *
 * Defines the types and adapter for Kiro-style three-file spec layout:
 *   requirements.md / design.md / tasks.md
 *
 * Also provides `specDocumentToBundle` to adapt the legacy single-file
 * `SpecDocument` into the new `SpecBundle` shape with `layout: "legacy-single"`.
 *
 * Validates: Requirement 1 (三文件目录结构)
 */
// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------
export function isFeatureBundle(bundle) {
    return bundle.kind === "feature";
}
export function isBugfixBundle(bundle) {
    return bundle.kind === "bugfix";
}
// ---------------------------------------------------------------------------
// Legacy adapter: SpecDocument → SpecBundle
// ---------------------------------------------------------------------------
/**
 * Convert a legacy single-file SpecDocument into a SpecBundle with
 * `layout: "legacy-single"`.
 *
 * The adapter maps:
 *   - SpecDocument.requirements[].scenarios → EarsClause[]
 *   - SpecDocument.exclusions → RequirementsDocument.outOfScope
 *   - SpecDocument.delta → RequirementsDocument.delta (brownfield)
 *   - design/tasks remain undefined (not present in single-file layout)
 */
export function specDocumentToBundle(spec) {
    const fm = {
        feature: spec.frontmatter.feature,
        status: spec.frontmatter.status,
        date: spec.frontmatter.date,
        workflow_variant: "requirements-first",
        brownfield: spec.isBrownfield,
        ...(spec.frontmatter.importSource ? { import_source: spec.frontmatter.importSource } : {}),
    };
    const earsCriteria = [];
    const userStories = [];
    for (const req of spec.requirements) {
        const clauses = req.scenarios.map((s, i) => {
            const match = s.match(/当\s*(.+?)\s*则\s*(.+)/);
            return {
                line: i + 1,
                when: match?.[1] ?? s,
                shall: match?.[2] ?? s,
                raw: s,
            };
        });
        earsCriteria.push(...clauses);
        userStories.push({
            title: req.title,
            description: req.description,
            earsCriteria: clauses,
        });
    }
    const primary = {
        frontmatter: fm,
        intro: spec.purpose,
        glossary: [],
        userStories,
        earsCriteria,
        nonFunctional: [],
        outOfScope: spec.exclusions,
        ...(spec.delta ? { delta: spec.delta } : {}),
    };
    return {
        feature: spec.frontmatter.feature,
        kind: "feature",
        layout: "legacy-single",
        variant: "requirements-first",
        primary,
    };
}
//# sourceMappingURL=spec-bundle.js.map