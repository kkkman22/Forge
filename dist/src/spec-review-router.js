/**
 * Review spec router — builds review context from SpecBundle.
 *
 * For three-file layout: references requirements/design/tasks separately.
 * For legacy-single: references spec.md only.
 * For bugfix: references bugfix/design/tasks.
 *
 * Validates: Requirement 6
 */
import { isBugfixBundle } from "./spec-bundle.js";
/**
 * Build review context from a SpecBundle.
 * Used by review subagents (spec-check, quality-check, security-check)
 * to reference the correct spec files.
 */
export function buildReviewSpecContext(bundle) {
    if (isBugfixBundle(bundle)) {
        return buildBugfixContext(bundle);
    }
    if (bundle.layout === "three-file") {
        return buildThreeFileContext(bundle);
    }
    return buildLegacyContext(bundle);
}
function buildThreeFileContext(bundle) {
    const earsCriteria = extractEarsCriteria(bundle);
    const taskIds = bundle.tasks?.tasks.map((t) => t.id) ?? [];
    const references = [
        { file: "requirements.md", role: "Requirements and acceptance criteria" },
        { file: "design.md", role: "Architecture and design decisions" },
        { file: "tasks.md", role: "Implementation tasks and waves" },
    ];
    const snippet = [
        "This spec uses three-file layout. Reference each file for its purpose:",
        "- requirements.md: EARS acceptance criteria, glossary, out-of-scope",
        "- design.md: architecture, data model, error handling",
        "- tasks.md: task list, wave scheduling, Definition of Done",
    ].join("\n");
    return {
        layout: "three-file",
        kind: bundle.kind,
        specReferences: references,
        earsCriteria,
        taskIds,
        promptSnippet: snippet,
    };
}
function buildLegacyContext(bundle) {
    const earsCriteria = extractEarsCriteria(bundle);
    return {
        layout: "legacy-single",
        kind: bundle.kind,
        specReferences: [{ file: "spec.md", role: "Single-file spec (legacy)" }],
        earsCriteria,
        taskIds: [],
        promptSnippet: "This spec uses legacy single-file layout (spec.md).",
    };
}
function buildBugfixContext(bundle) {
    const doc = bundle.primary;
    const taskIds = bundle.tasks?.tasks.map((t) => t.id) ?? [];
    const allClauses = [...doc.current, ...doc.expected, ...doc.unchanged];
    const references = [
        { file: "bugfix.md", role: "Current/Expected/Unchanged behavior" },
        { file: "design.md", role: "Root cause and fix strategy" },
        { file: "tasks.md", role: "Fix tasks and regression tests" },
    ];
    const snippet = [
        "This is a bugfix spec. Reference each file for its purpose:",
        "- bugfix.md: Current behavior, Expected behavior, Unchanged behavior (regression guards)",
        "- design.md: Root Cause Analysis, Fix Strategy, Test Properties",
        "- tasks.md: Fix implementation tasks + PBT regression tests",
    ].join("\n");
    return {
        layout: "three-file",
        kind: "bugfix",
        specReferences: references,
        earsCriteria: allClauses,
        taskIds,
        promptSnippet: snippet,
    };
}
function extractEarsCriteria(bundle) {
    const primary = bundle.primary;
    if ("earsCriteria" in primary) {
        return primary.earsCriteria;
    }
    if ("current" in primary) {
        const doc = primary;
        return [...doc.current, ...doc.expected, ...doc.unchanged];
    }
    return [];
}
//# sourceMappingURL=spec-review-router.js.map