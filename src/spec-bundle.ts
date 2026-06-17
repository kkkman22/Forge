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

// ---------------------------------------------------------------------------
// Primitive types
// ---------------------------------------------------------------------------

export type SpecStatus = "draft" | "locked";

export type SpecKind = "feature" | "bugfix";

export type WorkflowVariant = "requirements-first" | "design-first" | "quick-plan";

// ---------------------------------------------------------------------------
// SpecFileFrontmatter — shared across all three files
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// EarsClause — shared acceptance criteria format
// ---------------------------------------------------------------------------

export interface EarsClause {
  line: number;
  when: string;
  shall: string;
  raw: string;
  verifyBy?: "vitest" | "bash" | "forge_git" | "forge_exec" | "manual";
  evidence?: string;
}

// ---------------------------------------------------------------------------
// Glossary entry (requirements.md)
// ---------------------------------------------------------------------------

export interface GlossaryEntry {
  term: string;
  definition: string;
}

// ---------------------------------------------------------------------------
// User story (requirements.md)
// ---------------------------------------------------------------------------

export interface UserStory {
  title: string;
  description: string;
  earsCriteria: EarsClause[];
}

// ---------------------------------------------------------------------------
// RequirementsDocument — first file for feature specs
// ---------------------------------------------------------------------------

export interface RequirementsDocument {
  frontmatter: SpecFileFrontmatter;
  intro: string;
  glossary: GlossaryEntry[];
  userStories: UserStory[];
  earsCriteria: EarsClause[];
  nonFunctional: string[];
  outOfScope: string[];
  delta?: { added: string[]; modified: string[]; unchanged: string[] };
}

// ---------------------------------------------------------------------------
// DesignDocument — second file for feature specs
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// TaskSeed & Wave — shared task types
// ---------------------------------------------------------------------------

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

/**
 * Filter tasks down to those still remaining (not yet completed).
 *
 * Used by incremental replan (dynamic-replan-loop R3): when a debug finds
 * that remaining-plan assumptions are invalidated, replan revises only the
 * still-unfinished tasks. `status !== "completed"` covers pending, in-progress,
 * blocked, and failed — all are eligible for revision. Completed tasks are
 * never returned (they represent committed work that is not rolled back).
 *
 * **Validates: dynamic-replan-loop R3-AC2.**
 */
export function filterRemainingTasks(tasks: readonly TaskSeed[]): TaskSeed[] {
  return tasks.filter((t) => t.status !== "completed");
}

export interface Wave {
  wave: number;
  tasks: string[];
}

export interface ExecutionPackageMetadata {
  id: string;
  name: string;
  tasks: string[];
  depends_on_packages: string[];
  boundary_reason: string;
  estimated_loc: number;
  files_touched: number;
  verify_command: string;
  handoff_path: string;
  risk?: string;
}

// ---------------------------------------------------------------------------
// TasksSeedDocument — third file
// ---------------------------------------------------------------------------

export interface TasksSeedDocument {
  frontmatter: SpecFileFrontmatter;
  tasks: TaskSeed[];
  waves?: Wave[];
  execution_packages?: ExecutionPackageMetadata[];
}

// ---------------------------------------------------------------------------
// BugfixDocument — first file for bugfix specs
// ---------------------------------------------------------------------------

export interface BugfixDocument {
  frontmatter: SpecFileFrontmatter & { kind: "bugfix" };
  current: EarsClause[];
  expected: EarsClause[];
  unchanged: EarsClause[];
}

// ---------------------------------------------------------------------------
// BugfixDesignDocument — second file for bugfix specs
// ---------------------------------------------------------------------------

export interface BugfixDesignDocument {
  frontmatter: SpecFileFrontmatter & { kind: "bugfix" };
  rootCause: string;
  fixStrategy: string;
  testProperties: string;
}

// ---------------------------------------------------------------------------
// SpecBundle — aggregate view
// ---------------------------------------------------------------------------

export interface SpecBundle {
  feature: string;
  kind: SpecKind;
  layout: "three-file" | "legacy-single";
  variant: WorkflowVariant;
  primary: RequirementsDocument | BugfixDocument;
  design?: DesignDocument | BugfixDesignDocument;
  tasks?: TasksSeedDocument;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isFeatureBundle(bundle: SpecBundle): bundle is SpecBundle & {
  kind: "feature";
  primary: RequirementsDocument;
  design?: DesignDocument;
} {
  return bundle.kind === "feature";
}

export function isBugfixBundle(bundle: SpecBundle): bundle is SpecBundle & {
  kind: "bugfix";
  primary: BugfixDocument;
  design?: BugfixDesignDocument;
} {
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
export function specDocumentToBundle(spec: SpecDocument): SpecBundle {
  const fm: SpecFileFrontmatter = {
    feature: spec.frontmatter.feature,
    status: spec.frontmatter.status,
    date: spec.frontmatter.date,
    workflow_variant: "requirements-first",
    brownfield: spec.isBrownfield,
    ...(spec.frontmatter.importSource ? { import_source: spec.frontmatter.importSource } : {}),
  };

  const earsCriteria: EarsClause[] = [];
  const userStories: UserStory[] = [];

  for (const req of spec.requirements) {
    const clauses: EarsClause[] = req.scenarios.map((s, i) => {
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

  const primary: RequirementsDocument = {
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
