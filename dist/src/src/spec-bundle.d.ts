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
import type { SpecDocument } from "./spec.js";
export type SpecStatus = "draft" | "locked";
export type SpecKind = "feature" | "bugfix";
export type WorkflowVariant = "requirements-first" | "design-first" | "quick-plan";
export interface SpecFileFrontmatter {
    feature: string;
    status: SpecStatus;
    date: string;
    workflow_variant: WorkflowVariant;
    kind?: SpecKind;
    migrated_from?: string;
    import_source?: string;
    brownfield?: boolean;
    contract_legacy?: boolean;
}
export interface EarsClause {
    line: number;
    when: string;
    shall: string;
    raw: string;
    verifyBy?: "vitest" | "bash" | "forge_git" | "forge_exec" | "manual";
    evidence?: string;
}
export interface GlossaryEntry {
    term: string;
    definition: string;
}
export interface UserStory {
    title: string;
    description: string;
    earsCriteria: EarsClause[];
}
export interface RequirementsDocument {
    frontmatter: SpecFileFrontmatter;
    intro: string;
    glossary: GlossaryEntry[];
    userStories: UserStory[];
    earsCriteria: EarsClause[];
    nonFunctional: string[];
    outOfScope: string[];
    delta?: {
        added: string[];
        modified: string[];
        unchanged: string[];
    };
}
export interface DesignDocument {
    frontmatter: SpecFileFrontmatter;
    overview: string;
    architecture: string;
    componentInterfaces: string[];
    dataModel: string;
    errorHandling: string;
    testingStrategy: string;
    rollout: string;
    openQuestions: string[];
    currentState?: string;
    proposedChange?: string;
    reversibility?: string;
}
export interface TaskSeed {
    id: string;
    title: string;
    goal: string;
    related_requirements: string[];
    depends_on?: string[];
    estimate?: string;
    status: "pending" | "in-progress" | "completed" | "blocked" | "failed";
    category?: "implementation" | "regression-test" | "doc" | "config";
    verification?: "auto" | "manual" | "pbt";
    source_clause?: string;
    verified_by?: string;
    verified_at?: string;
}
export interface Wave {
    wave: number;
    tasks: string[];
}
export interface TasksSeedDocument {
    frontmatter: SpecFileFrontmatter;
    tasks: TaskSeed[];
    waves?: Wave[];
}
export interface BugfixDocument {
    frontmatter: SpecFileFrontmatter & {
        kind: "bugfix";
    };
    current: EarsClause[];
    expected: EarsClause[];
    unchanged: EarsClause[];
}
export interface BugfixDesignDocument {
    frontmatter: SpecFileFrontmatter & {
        kind: "bugfix";
    };
    rootCause: string;
    fixStrategy: string;
    testProperties: string;
}
export interface SpecBundle {
    feature: string;
    kind: SpecKind;
    layout: "three-file" | "legacy-single";
    variant: WorkflowVariant;
    primary: RequirementsDocument | BugfixDocument;
    design?: DesignDocument | BugfixDesignDocument;
    tasks?: TasksSeedDocument;
}
export declare function isFeatureBundle(bundle: SpecBundle): bundle is SpecBundle & {
    kind: "feature";
    primary: RequirementsDocument;
    design?: DesignDocument;
};
export declare function isBugfixBundle(bundle: SpecBundle): bundle is SpecBundle & {
    kind: "bugfix";
    primary: BugfixDocument;
    design?: BugfixDesignDocument;
};
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
export declare function specDocumentToBundle(spec: SpecDocument): SpecBundle;
