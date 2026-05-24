/**
 * T-01: Data contract tests — SpecBundle, RequirementsDocument, DesignDocument,
 * TasksSeedDocument, SpecFileFrontmatter, WorkflowVariant, EarsClause types
 * and SpecDocument.toBundle() adapter.
 *
 * Validates: Requirement 1 (三文件目录结构)
 */
import { describe, expect, it } from "vitest";
import { isBugfixBundle, isFeatureBundle, specDocumentToBundle, } from "../src/spec-bundle.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeSpecDocument(overrides) {
    return {
        frontmatter: {
            feature: "test-feature",
            status: "draft",
            date: "2026-05-23",
        },
        purpose: "Test purpose",
        requirements: [
            {
                title: "R1",
                description: "Test requirement",
                scenarios: ["当 X 时 系统应当 Y"],
            },
        ],
        exclusions: ["Out of scope"],
        isBrownfield: false,
        ...overrides,
    };
}
function makeSpecFileFrontmatter(overrides) {
    return {
        feature: "test-feature",
        status: "draft",
        date: "2026-05-23",
        workflow_variant: "requirements-first",
        ...overrides,
    };
}
function makeEarsClause() {
    return {
        line: 1,
        when: "用户提交表单",
        shall: "系统返回成功提示",
        raw: "当 用户提交表单 时 系统应当 系统返回成功提示",
    };
}
function makeRequirementsDocument() {
    return {
        frontmatter: makeSpecFileFrontmatter(),
        intro: "Introduction text",
        glossary: [{ term: "SpecBundle", definition: "三文件聚合视图" }],
        userStories: [
            { title: "US1", description: "作为...我希望...", earsCriteria: [makeEarsClause()] },
        ],
        earsCriteria: [makeEarsClause()],
        nonFunctional: ["性能要求"],
        outOfScope: ["不做什么"],
    };
}
function makeDesignDocument() {
    return {
        frontmatter: makeSpecFileFrontmatter(),
        overview: "Design overview",
        architecture: "Architecture desc",
        componentInterfaces: ["Component A"],
        dataModel: "Data model desc",
        errorHandling: "Error handling desc",
        testingStrategy: "Testing strategy desc",
        rollout: "Rollout plan",
        openQuestions: ["Q1"],
    };
}
function makeTaskSeed() {
    return {
        id: "T-01",
        title: "Test task",
        goal: "Implement X",
        related_requirements: ["R1"],
        status: "pending",
    };
}
function makeTasksSeedDocument() {
    return {
        frontmatter: makeSpecFileFrontmatter(),
        tasks: [makeTaskSeed()],
    };
}
// ---------------------------------------------------------------------------
// Type existence & importability
// ---------------------------------------------------------------------------
describe("T-01 Data Contract: type existence", () => {
    it("WorkflowVariant allows three variants", () => {
        const variants = ["requirements-first", "design-first", "quick-plan"];
        expect(variants).toHaveLength(3);
    });
    it("SpecStatus allows draft and locked", () => {
        const statuses = ["draft", "locked"];
        expect(statuses).toHaveLength(2);
    });
    it("SpecKind allows feature and bugfix", () => {
        const kinds = ["feature", "bugfix"];
        expect(kinds).toHaveLength(2);
    });
    it("SpecFileFrontmatter has required fields", () => {
        const fm = makeSpecFileFrontmatter();
        expect(fm.feature).toBe("test-feature");
        expect(fm.status).toBe("draft");
        expect(fm.date).toBe("2026-05-23");
        expect(fm.workflow_variant).toBe("requirements-first");
    });
    it("SpecFileFrontmatter has optional brownfield/kind/migrated_from/import_source/contract_legacy", () => {
        const fm = {
            ...makeSpecFileFrontmatter(),
            kind: "feature",
            brownfield: true,
            migrated_from: "spec.md",
            import_source: "./external.md",
            contract_legacy: true,
        };
        expect(fm.kind).toBe("feature");
        expect(fm.brownfield).toBe(true);
        expect(fm.migrated_from).toBe("spec.md");
        expect(fm.import_source).toBe("./external.md");
        expect(fm.contract_legacy).toBe(true);
    });
    it("EarsClause has required fields", () => {
        const clause = makeEarsClause();
        expect(clause.line).toBe(1);
        expect(clause.when).toBeTruthy();
        expect(clause.shall).toBeTruthy();
        expect(clause.raw).toBeTruthy();
    });
    it("EarsClause has optional verifyBy and evidence", () => {
        const clause = {
            ...makeEarsClause(),
            verifyBy: "vitest",
            evidence: "test passes",
        };
        expect(clause.verifyBy).toBe("vitest");
        expect(clause.evidence).toBe("test passes");
    });
});
// ---------------------------------------------------------------------------
// RequirementsDocument
// ---------------------------------------------------------------------------
describe("RequirementsDocument structure", () => {
    it("has intro, glossary, userStories, earsCriteria, nonFunctional, outOfScope", () => {
        const doc = makeRequirementsDocument();
        expect(doc.intro).toBeTruthy();
        expect(doc.glossary).toHaveLength(1);
        expect(doc.userStories).toHaveLength(1);
        expect(doc.earsCriteria).toHaveLength(1);
        expect(doc.nonFunctional).toHaveLength(1);
        expect(doc.outOfScope).toHaveLength(1);
    });
    it("has optional delta for brownfield", () => {
        const doc = {
            ...makeRequirementsDocument(),
            delta: { added: ["A"], modified: ["B"], unchanged: ["C"] },
        };
        expect(doc.delta).toBeDefined();
        expect(doc.delta.added).toHaveLength(1);
    });
});
// ---------------------------------------------------------------------------
// DesignDocument
// ---------------------------------------------------------------------------
describe("DesignDocument structure", () => {
    it("has all required fields", () => {
        const doc = makeDesignDocument();
        expect(doc.overview).toBeTruthy();
        expect(doc.architecture).toBeTruthy();
        expect(doc.componentInterfaces).toHaveLength(1);
        expect(doc.dataModel).toBeTruthy();
        expect(doc.errorHandling).toBeTruthy();
        expect(doc.testingStrategy).toBeTruthy();
        expect(doc.rollout).toBeTruthy();
        expect(doc.openQuestions).toHaveLength(1);
    });
    it("has optional brownfield fields", () => {
        const doc = {
            ...makeDesignDocument(),
            currentState: "file:line references",
            proposedChange: "change points",
            reversibility: "rollback plan",
        };
        expect(doc.currentState).toBeTruthy();
        expect(doc.proposedChange).toBeTruthy();
        expect(doc.reversibility).toBeTruthy();
    });
});
// ---------------------------------------------------------------------------
// TasksSeedDocument & TaskSeed & Wave
// ---------------------------------------------------------------------------
describe("TasksSeedDocument structure", () => {
    it("has frontmatter and tasks array", () => {
        const doc = makeTasksSeedDocument();
        expect(doc.frontmatter.feature).toBe("test-feature");
        expect(doc.tasks).toHaveLength(1);
        expect(doc.tasks[0].id).toBe("T-01");
        expect(doc.tasks[0].status).toBe("pending");
    });
    it("has optional waves filled by plan stage", () => {
        const wave = { wave: 1, tasks: ["T-01"] };
        const doc = {
            ...makeTasksSeedDocument(),
            waves: [wave],
        };
        expect(doc.waves).toHaveLength(1);
        expect(doc.waves[0].tasks).toContain("T-01");
    });
});
describe("TaskSeed fields", () => {
    it("has required fields", () => {
        const task = makeTaskSeed();
        expect(task.id).toBeTruthy();
        expect(task.title).toBeTruthy();
        expect(task.goal).toBeTruthy();
        expect(task.related_requirements).toHaveLength(1);
        expect(task.status).toBe("pending");
    });
    it("has optional fields for plan/build stages", () => {
        const task = {
            ...makeTaskSeed(),
            depends_on: ["T-00"],
            estimate: "2h",
            category: "regression-test",
            verification: "pbt",
            source_clause: "bugfix.md#unchanged-1",
            verified_by: "developer",
            verified_at: "2026-05-23T10:00:00Z",
        };
        expect(task.depends_on).toContain("T-00");
        expect(task.estimate).toBe("2h");
        expect(task.category).toBe("regression-test");
        expect(task.verification).toBe("pbt");
        expect(task.source_clause).toBeTruthy();
        expect(task.verified_by).toBeTruthy();
        expect(task.verified_at).toBeTruthy();
    });
});
// ---------------------------------------------------------------------------
// SpecBundle
// ---------------------------------------------------------------------------
describe("SpecBundle structure", () => {
    it("feature bundle has kind=feature with RequirementsDocument as primary", () => {
        const bundle = {
            feature: "test-feature",
            kind: "feature",
            layout: "three-file",
            variant: "requirements-first",
            primary: makeRequirementsDocument(),
            design: makeDesignDocument(),
            tasks: makeTasksSeedDocument(),
        };
        expect(bundle.kind).toBe("feature");
        expect(bundle.layout).toBe("three-file");
        expect(bundle.variant).toBe("requirements-first");
    });
    it("bugfix bundle has kind=bugfix with BugfixDocument as primary", () => {
        const bugfixPrimary = {
            frontmatter: { ...makeSpecFileFrontmatter(), kind: "bugfix" },
            current: [makeEarsClause()],
            expected: [makeEarsClause()],
            unchanged: [makeEarsClause()],
        };
        const bugfixDesign = {
            frontmatter: { ...makeSpecFileFrontmatter(), kind: "bugfix" },
            rootCause: "Root cause analysis",
            fixStrategy: "Fix strategy",
            testProperties: "PBT strategy",
        };
        const bundle = {
            feature: "test-feature",
            kind: "bugfix",
            layout: "three-file",
            variant: "requirements-first",
            primary: bugfixPrimary,
            design: bugfixDesign,
        };
        expect(bundle.kind).toBe("bugfix");
    });
});
// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------
describe("Type guards", () => {
    it("isFeatureBundle returns true for feature bundles", () => {
        const bundle = {
            feature: "test",
            kind: "feature",
            layout: "three-file",
            variant: "requirements-first",
            primary: makeRequirementsDocument(),
        };
        expect(isFeatureBundle(bundle)).toBe(true);
        expect(isBugfixBundle(bundle)).toBe(false);
    });
    it("isBugfixBundle returns true for bugfix bundles", () => {
        const bundle = {
            feature: "test",
            kind: "bugfix",
            layout: "three-file",
            variant: "requirements-first",
            primary: {
                frontmatter: { ...makeSpecFileFrontmatter(), kind: "bugfix" },
                current: [makeEarsClause()],
                expected: [makeEarsClause()],
                unchanged: [makeEarsClause()],
            },
        };
        expect(isBugfixBundle(bundle)).toBe(true);
        expect(isFeatureBundle(bundle)).toBe(false);
    });
});
// ---------------------------------------------------------------------------
// SpecDocument.toBundle() adapter
// ---------------------------------------------------------------------------
describe("specDocumentToBundle adapter", () => {
    it("converts SpecDocument to SpecBundle with layout=legacy-single", () => {
        const spec = makeSpecDocument();
        const bundle = specDocumentToBundle(spec);
        expect(bundle.layout).toBe("legacy-single");
        expect(bundle.kind).toBe("feature");
        expect(bundle.feature).toBe("test-feature");
        expect(bundle.variant).toBe("requirements-first");
    });
    it("maps SpecDocument requirements to EarsClause format", () => {
        const spec = makeSpecDocument();
        const bundle = specDocumentToBundle(spec);
        const reqDoc = bundle.primary;
        expect(reqDoc.earsCriteria.length).toBeGreaterThan(0);
        expect(reqDoc.earsCriteria[0].raw).toContain("当");
    });
    it("preserves brownfield delta from SpecDocument", () => {
        const spec = makeSpecDocument({
            isBrownfield: true,
            delta: {
                added: ["new file"],
                modified: ["changed file"],
                unchanged: ["untouched file"],
            },
        });
        const bundle = specDocumentToBundle(spec);
        const reqDoc = bundle.primary;
        expect(reqDoc.delta).toBeDefined();
        expect(reqDoc.delta.added).toContain("new file");
    });
    it("preserves exclusions as outOfScope", () => {
        const spec = makeSpecDocument();
        const bundle = specDocumentToBundle(spec);
        const reqDoc = bundle.primary;
        expect(reqDoc.outOfScope).toContain("Out of scope");
    });
    it("sets design and tasks to undefined for legacy-single layout", () => {
        const spec = makeSpecDocument();
        const bundle = specDocumentToBundle(spec);
        expect(bundle.design).toBeUndefined();
        expect(bundle.tasks).toBeUndefined();
    });
});
//# sourceMappingURL=spec-bundle.test.js.map