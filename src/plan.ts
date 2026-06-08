/**
 * Plan engine — core validation logic extracted from forge-plan/SKILL.md.
 *
 * Implements Plan task validation:
 *   - validateAtomicTask:  Validates a single atomic task has all required fields
 *   - scanForPlaceholders: Scans text for forbidden placeholder content
 *   - validatePlanTasks:   Validates all tasks in a plan (full format)
 *   - validateLightweightTask / validateLightweightPlan: Lightweight format validation
 *   - detectPlanFormat:    Detects plan format from frontmatter
 *   - validatePlan:        Unified dispatcher that routes to the correct validator
 *
 * Per SKILL.md §3, each atomic task must contain:
 *   - Task number, title, file path
 *   - TDD steps (RED/GREEN/REFACTOR)
 *   - Estimated time (2-5 minutes)
 *   - Verify command, commit message
 *   - No forbidden placeholders
 *
 * Per SKILL.md §4, forbidden placeholders:
 *   TBD, TODO, 待定, 后续补充, 类似 Task, 添加适当的错误处理
 */

import { extractStringField } from "./frontmatter.js";
import type { Glossary, GlossaryTerm } from "./glossary.js";
import type { TasksSeedDocument } from "./spec-bundle.js";

import { upgradeTasksSeed } from "./spec-plan-upgrade.js";
import { type TaskGraph, topologicalOrder, validateGraph } from "./task-graph.js";

export type { TasksSeedDocument } from "./spec-bundle.js";
export { upgradeTasksSeed } from "./spec-plan-upgrade.js";

// ---------------------------------------------------------------------------
// Types — Full format (Atomic Task)
// ---------------------------------------------------------------------------

/** @public */
export interface TDDSteps {
  red: { testFile: string; testCode: string; runCommand: string };
  green: { sourceFile: string; sourceCode: string; runCommand: string };
  refactor: string;
}

/** @public */
export interface AtomicTask {
  taskNumber: number;
  title: string;
  filePath: string;
  estimatedMinutes: number;
  tddSteps: TDDSteps;
  verifyCommand: string;
  commitMessage: string;
  dependsOn?: number[];
}

// ---------------------------------------------------------------------------
// Execution package context control
// ---------------------------------------------------------------------------

export type TaskTestScope = "unit" | "integration" | "e2e" | "migration";
export type TaskRisk = "low" | "medium" | "high";

export interface TaskWeight {
  files_touched: number;
  estimated_loc: number;
  layers: string[];
  new_dependencies: number;
  test_scope: TaskTestScope;
  risk: TaskRisk;
  estimated_minutes: number;
  narrow_vertical_slice?: boolean;
}

export interface TaskWeightClassification {
  overweight: boolean;
  highRisk: boolean;
  reasons: string[];
}

export interface WeightedPlanTask {
  id: string;
  title: string;
  task_weight: TaskWeight;
  split_into?: string[];
}

export interface OverweightSplitValidation {
  valid: boolean;
  errors: string[];
}

export interface ExecutionPackage {
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

export interface GenerateExecutionPackagesOptions {
  taskWeights?: Record<string, TaskWeight>;
  packageTaskTarget?: number;
  packageLocLimit?: number;
  packageFileLimit?: number;
  runId?: string;
}

export interface ExecutionPackageGenerationResult {
  packages: ExecutionPackage[];
  warnings: string[];
}

export const TASK_WEIGHT_THRESHOLDS = {
  filesTouched: 5,
  estimatedLoc: 150,
  layers: 3,
} as const;

const DEFAULT_PACKAGE_TASK_TARGET = 5;
const DEFAULT_PACKAGE_LOC_LIMIT = 300;
const DEFAULT_PACKAGE_FILE_LIMIT = 8;

/** @public */
export function classifyTaskWeight(weight: TaskWeight): TaskWeightClassification {
  const reasons: string[] = [];

  if (weight.files_touched >= TASK_WEIGHT_THRESHOLDS.filesTouched) {
    reasons.push("files_touched >= 5");
  }
  if (weight.estimated_loc >= TASK_WEIGHT_THRESHOLDS.estimatedLoc) {
    reasons.push("estimated_loc >= 150");
  }
  if (weight.layers.length >= TASK_WEIGHT_THRESHOLDS.layers && !weight.narrow_vertical_slice) {
    reasons.push("layers >= 3");
  }
  if (weight.new_dependencies > 0) {
    reasons.push("new_dependencies > 0");
  }

  const highRisk = ["integration", "e2e", "migration"].includes(weight.test_scope);
  if (highRisk) {
    reasons.push(`test_scope ${weight.test_scope}`);
  }

  return {
    overweight: reasons.length > 0,
    highRisk,
    reasons,
  };
}

/** @public */
export function validateOverweightTaskSplits(
  tasks: WeightedPlanTask[],
  _options: { monolith_acknowledged?: boolean } = {},
): OverweightSplitValidation {
  const errors: string[] = [];

  for (const task of tasks) {
    const classification = classifyTaskWeight(task.task_weight);
    if (classification.overweight && (!task.split_into || task.split_into.length === 0)) {
      errors.push(`Task ${task.id} requires split: ${classification.reasons.join(", ")}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function emptyWeight(): TaskWeight {
  return {
    files_touched: 1,
    estimated_loc: 0,
    layers: [],
    new_dependencies: 0,
    test_scope: "unit",
    risk: "low",
    estimated_minutes: 0,
  };
}

function combinePackageDependencies(
  packageTasks: string[],
  taskToPackage: Map<string, string>,
  graph: TaskGraph,
): string[] {
  const taskSet = new Set(packageTasks);
  const deps = new Set<string>();

  for (const taskId of packageTasks) {
    const task = graph.tasks.find((candidate) => candidate.id === taskId);
    for (const dep of task?.dependsOn ?? []) {
      if (taskSet.has(dep)) continue;
      const depPackage = taskToPackage.get(dep);
      if (depPackage) deps.add(depPackage);
    }
  }

  return [...deps].sort();
}

/** @public */
export function generateExecutionPackages(
  graph: TaskGraph,
  options: GenerateExecutionPackagesOptions = {},
): ExecutionPackageGenerationResult {
  const validation = validateGraph(graph);
  if (!validation.valid) {
    return { packages: [], warnings: validation.errors };
  }

  const order = topologicalOrder(graph) ?? graph.tasks.map((task) => task.id);
  const packageTaskTarget = options.packageTaskTarget ?? DEFAULT_PACKAGE_TASK_TARGET;
  const packageLocLimit = options.packageLocLimit ?? DEFAULT_PACKAGE_LOC_LIMIT;
  const packageFileLimit = options.packageFileLimit ?? DEFAULT_PACKAGE_FILE_LIMIT;
  const runId = options.runId ?? "<run-id>";
  const packages: ExecutionPackage[] = [];
  const taskToPackage = new Map<string, string>();
  const warnings: string[] = [];

  let current: string[] = [];
  let currentLoc = 0;
  let currentFiles = 0;

  function flush(reason: string): void {
    if (current.length === 0) return;
    const id = `P${packages.length + 1}`;
    const pkg: ExecutionPackage = {
      id,
      name: `Package ${packages.length + 1}`,
      tasks: current,
      depends_on_packages: [],
      boundary_reason: reason,
      estimated_loc: currentLoc,
      files_touched: currentFiles,
      verify_command: `npm run check`,
      handoff_path: `.forge/runs/${runId}/packages/${id}.md`,
    };
    packages.push(pkg);
    for (const taskId of current) taskToPackage.set(taskId, id);
    current = [];
    currentLoc = 0;
    currentFiles = 0;
  }

  for (const taskId of order) {
    const weight = options.taskWeights?.[taskId] ?? emptyWeight();
    const classification = classifyTaskWeight(weight);
    const isolate = classification.highRisk;

    if (isolate && current.length > 0) {
      flush("before high-risk isolated task");
    }

    const wouldExceedTaskCount = current.length >= packageTaskTarget;
    const wouldExceedLoc =
      current.length > 0 && currentLoc + weight.estimated_loc > packageLocLimit;
    const wouldExceedFiles =
      current.length > 0 && currentFiles + weight.files_touched > packageFileLimit;

    if (wouldExceedTaskCount || wouldExceedLoc || wouldExceedFiles) {
      flush(
        wouldExceedTaskCount
          ? "task count boundary"
          : wouldExceedLoc
            ? "estimated LOC boundary"
            : "files touched boundary",
      );
    }

    current.push(taskId);
    currentLoc += weight.estimated_loc;
    currentFiles += weight.files_touched;

    if (isolate) {
      flush("high-risk isolated task");
    }
  }

  flush("final package");

  for (const pkg of packages) {
    pkg.depends_on_packages = combinePackageDependencies(pkg.tasks, taskToPackage, graph).filter(
      (dep) => dep !== pkg.id,
    );
    if (pkg.estimated_loc > packageLocLimit || pkg.files_touched > packageFileLimit) {
      pkg.risk = "exceeds recommended package limits";
      warnings.push(`${pkg.id} exceeds recommended package limits`);
    }
  }

  return { packages, warnings };
}

// ---------------------------------------------------------------------------
// Types — Lightweight format
// ---------------------------------------------------------------------------

/** @public */
export type PlanFormat = "lightweight" | "full";

/** @public */
export interface LightweightTask {
  taskNumber: number;
  title: string;
  filePath: string;
  goal: string;
  designReference: string;
  propertyRef?: number;
  verifyCommand: string;
  commitMessage: string;
  dependsOn?: number[];
}

/** @public */
export interface DesignReferenceEntry {
  anchor: string;
  summary: string;
}

/** @public */
export interface DesignReferenceValidation {
  valid: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Task Graph bridge
// ---------------------------------------------------------------------------

/**
 * Convert AtomicTask[] or LightweightTask[] to a TaskGraph for use with
 * task-graph.ts validation and scheduling functions.
 *
 * Each task's `taskNumber` is mapped to `task-{n}` string ID format.
 * Undefined or missing `dependsOn` is normalized to empty array.
 * @public
 */
export function toTaskGraph(tasks: AtomicTask[] | LightweightTask[]): TaskGraph {
  return {
    tasks: tasks.map((t) => ({
      id: `task-${t.taskNumber}`,
      title: t.title,
      dependsOn: (t.dependsOn ?? []).map((d) => `task-${d}`),
      status: "pending" as import("./task-graph.js").TaskStatus,
    })),
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** @public */
export const FORBIDDEN_PLACEHOLDERS = [
  "TBD",
  "TODO",
  "待定",
  "后续补充",
  "类似 Task",
  "添加适当的错误处理",
];

const FORBIDDEN_PLACEHOLDERS_LOWER = FORBIDDEN_PLACEHOLDERS.map((p) => p.toLowerCase());

const MIN_ESTIMATED_MINUTES = 2;
const MAX_ESTIMATED_MINUTES = 5;

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

/**
 * Scan a text string for forbidden placeholder content.
 *
 * Per SKILL.md §4, the scan is case-insensitive and matches exact text
 * and common variants (e.g., `tbd`, `Todo`, `TODO:`, `// TODO`).
 *
 * Returns an array of found placeholder strings. Empty array means clean.
 * @public
 */
export function scanForPlaceholders(text: string): string[] {
  const found: string[] = [];
  const lowerText = text.toLowerCase();

  for (let i = 0; i < FORBIDDEN_PLACEHOLDERS_LOWER.length; i++) {
    if (lowerText.includes(FORBIDDEN_PLACEHOLDERS_LOWER[i])) {
      found.push(FORBIDDEN_PLACEHOLDERS[i]);
    }
  }

  return found;
}

/**
 * Validate a single atomic task.
 *
 * Checks:
 *   (a) All required fields are present and non-empty
 *   (b) Estimated time is between 2 and 5 minutes
 *   (c) No forbidden placeholders in any text field
 *   (d) Referenced types/functions consistency (checked at plan level)
 *
 * Returns { valid, errors } where errors lists all validation failures.
 * @public
 */
export function validateAtomicTask(task: AtomicTask): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // (a) Required fields: file path
  if (!task.filePath || task.filePath.trim() === "") {
    errors.push("Missing file path");
  }

  // (a) Required fields: title
  if (!task.title || task.title.trim() === "") {
    errors.push("Missing title");
  }

  // (a) Required fields: TDD steps — RED
  if (!task.tddSteps.red.testFile || task.tddSteps.red.testFile.trim() === "") {
    errors.push("Missing TDD RED test file");
  }
  if (!task.tddSteps.red.testCode || task.tddSteps.red.testCode.trim() === "") {
    errors.push("Missing TDD RED test code");
  }
  if (!task.tddSteps.red.runCommand || task.tddSteps.red.runCommand.trim() === "") {
    errors.push("Missing TDD RED run command");
  }

  // (a) Required fields: TDD steps — GREEN
  if (!task.tddSteps.green.sourceFile || task.tddSteps.green.sourceFile.trim() === "") {
    errors.push("Missing TDD GREEN source file");
  }
  if (!task.tddSteps.green.sourceCode || task.tddSteps.green.sourceCode.trim() === "") {
    errors.push("Missing TDD GREEN source code");
  }
  if (!task.tddSteps.green.runCommand || task.tddSteps.green.runCommand.trim() === "") {
    errors.push("Missing TDD GREEN run command");
  }

  // (a) Required fields: TDD steps — REFACTOR
  if (!task.tddSteps.refactor || task.tddSteps.refactor.trim() === "") {
    errors.push("Missing TDD REFACTOR description");
  }

  // (a) Required fields: verify command
  if (!task.verifyCommand || task.verifyCommand.trim() === "") {
    errors.push("Missing verify command");
  }

  // (a) Required fields: commit message
  if (!task.commitMessage || task.commitMessage.trim() === "") {
    errors.push("Missing commit message");
  }

  // (b) Estimated time must be 2-5 minutes, and must be a finite positive integer
  if (
    !Number.isFinite(task.estimatedMinutes) ||
    !Number.isInteger(task.estimatedMinutes) ||
    task.estimatedMinutes < MIN_ESTIMATED_MINUTES ||
    task.estimatedMinutes > MAX_ESTIMATED_MINUTES
  ) {
    errors.push(
      `Estimated time ${task.estimatedMinutes} min is invalid or outside the allowed range (${MIN_ESTIMATED_MINUTES}-${MAX_ESTIMATED_MINUTES} min, must be a finite integer)`,
    );
  }

  // (c) Scan all text fields for forbidden placeholders
  const textFields = [
    task.title,
    task.filePath,
    task.tddSteps.red.testFile,
    task.tddSteps.red.testCode,
    task.tddSteps.red.runCommand,
    task.tddSteps.green.sourceFile,
    task.tddSteps.green.sourceCode,
    task.tddSteps.green.runCommand,
    task.tddSteps.refactor,
    task.verifyCommand,
    task.commitMessage,
  ];

  const allText = textFields.join("\n");
  const placeholders = scanForPlaceholders(allText);
  if (placeholders.length > 0) {
    errors.push(`Found forbidden placeholders: ${placeholders.join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate that the associated spec is in "locked" status before plan execution.
 *
 * Per R24: Plan execution requires a locked spec to ensure the plan is based
 * on a confirmed specification.
 * @public
 */
export function validateSpecLocked(
  specStatus: string,
): { valid: true } | { valid: false; error: string } {
  if (specStatus !== "locked") {
    return { valid: false, error: "spec not locked" };
  }
  return { valid: true };
}

/**
 * Validate that all `dependsOn` references in a task list point to existing
 * `taskNumber` values.
 *
 * Per R25: Each task's `dependsOn` array (if present) must only reference
 * task numbers that exist in the plan.
 * @public
 */
export function validateDependencies(
  tasks: Array<{ taskNumber: number; dependsOn?: number[] }>,
): string[] {
  const errors: string[] = [];
  const taskNumbers = new Set(tasks.map((t) => t.taskNumber));

  for (const task of tasks) {
    if (task.dependsOn) {
      for (const dep of task.dependsOn) {
        if (!taskNumbers.has(dep)) {
          errors.push(`Task ${task.taskNumber} depends on non-existent task ${dep}`);
        }
      }
    }
  }

  return errors;
}

/**
 * Detect cycles in task dependencies using Kahn's algorithm.
 * Returns an error message if a cycle is found, null otherwise.
 */
function detectCycleInTasks(
  tasks: Array<{ taskNumber: number; dependsOn?: number[] }>,
): string | null {
  const inDegree = new Map<number, number>();
  const adjacency = new Map<number, number[]>();

  for (const task of tasks) {
    inDegree.set(task.taskNumber, 0);
    adjacency.set(task.taskNumber, []);
  }

  for (const task of tasks) {
    if (task.dependsOn) {
      for (const dep of task.dependsOn) {
        if (adjacency.has(dep)) {
          adjacency.get(dep)?.push(task.taskNumber);
          inDegree.set(task.taskNumber, (inDegree.get(task.taskNumber) ?? 0) + 1);
        }
      }
    }
  }

  const queue: number[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  let processed = 0;
  while (queue.length > 0) {
    // biome-ignore lint/style/noNonNullAssertion: shift() is safe — loop guard ensures length > 0
    const current = queue.shift()!;
    processed++;
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (processed < tasks.length) {
    const cycleNodes = tasks
      .filter((t) => (inDegree.get(t.taskNumber) ?? 0) > 0)
      .map((t) => t.taskNumber);
    return `Cycle detected involving tasks: ${cycleNodes.join(", ")}`;
  }

  return null;
}

/**
 * Validate that tasks are in topological order: dependencies appear before dependents.
 * Returns an error message if ordering is violated, null otherwise.
 */
function validateTopologicalOrder(
  tasks: Array<{ taskNumber: number; dependsOn?: number[] }>,
): string | null {
  const position = new Map<number, number>();
  for (let i = 0; i < tasks.length; i++) {
    position.set(tasks[i].taskNumber, i);
  }

  for (const task of tasks) {
    if (task.dependsOn) {
      for (const dep of task.dependsOn) {
        const depPos = position.get(dep);
        if (depPos !== undefined && depPos > (position.get(task.taskNumber) ?? -1)) {
          return `Task ${task.taskNumber} depends on task ${dep}, but task ${dep} appears after task ${task.taskNumber}`;
        }
      }
    }
  }

  return null;
}

/**
 * Validate all tasks in a plan.
 *
 * Returns true only if every task passes validateAtomicTask and all
 * `dependsOn` references are valid.
 * @public
 */
export function validatePlanTasks(tasks: AtomicTask[]): boolean {
  if (tasks.length === 0) {
    return false;
  }

  const allTasksValid = tasks.every((task) => validateAtomicTask(task).valid);
  if (!allTasksValid) {
    return false;
  }

  const dependencyErrors = validateDependencies(tasks);
  if (dependencyErrors.length > 0) return false;

  if (detectCycleInTasks(tasks)) return false;
  if (validateTopologicalOrder(tasks)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Lightweight format — format detection
// ---------------------------------------------------------------------------

/** @public */
export function detectPlanFormat(frontmatter: string): PlanFormat {
  const value = extractStringField(frontmatter, "format");
  if (value === "lightweight") return "lightweight";
  return "full";
}

// ---------------------------------------------------------------------------
// Lightweight format — heading anchor extraction
// ---------------------------------------------------------------------------

/** @public */
export function extractHeadingAnchors(markdownContent: string): string[] {
  const anchors: string[] = [];
  const lines = markdownContent.split("\n");

  for (const line of lines) {
    const match = line.match(/^#{1,6}\s+(.+)$/);
    if (match) {
      const headingText = match[1];
      const anchor = headingText
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9\-_]/g, "")
        .replace(/^-+|-+$/g, "");
      anchors.push(anchor);
    }
  }

  return anchors;
}

// ---------------------------------------------------------------------------
// Lightweight format — task validation
// ---------------------------------------------------------------------------

const DESIGN_REF_PATTERN = /^design\.md#[a-z0-9\-_]+$/;

/** @public */
export function validateLightweightTask(task: LightweightTask): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!task.title || task.title.trim() === "") errors.push("Missing title");
  if (!task.filePath || task.filePath.trim() === "") errors.push("Missing file path");
  if (!task.goal || task.goal.trim() === "") errors.push("Missing goal");
  if (!task.verifyCommand || task.verifyCommand.trim() === "")
    errors.push("Missing verify command");
  if (!task.commitMessage || task.commitMessage.trim() === "")
    errors.push("Missing commit message");

  if (
    task.propertyRef !== undefined &&
    (!Number.isFinite(task.propertyRef) ||
      !Number.isInteger(task.propertyRef) ||
      task.propertyRef < 1)
  ) {
    errors.push(`Invalid propertyRef: ${task.propertyRef} (must be a positive integer)`);
  }

  if (!task.designReference || task.designReference.trim() === "") {
    errors.push("Missing design reference");
  } else if (!DESIGN_REF_PATTERN.test(task.designReference)) {
    errors.push(`Invalid Design Reference format: ${task.designReference}`);
  }

  const textFields = [
    task.title,
    task.filePath,
    task.goal,
    task.designReference,
    task.verifyCommand,
    task.commitMessage,
  ];
  const allText = textFields.join("\n");
  const placeholders = scanForPlaceholders(allText);
  if (placeholders.length > 0) {
    errors.push(`Found forbidden placeholders: ${placeholders.join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}

/** @public */
export function validateLightweightPlan(tasks: LightweightTask[]): boolean {
  if (tasks.length === 0) return false;

  const allValid = tasks.every((task) => validateLightweightTask(task).valid);
  if (!allValid) return false;

  if (validateDependencies(tasks).length > 0) return false;

  if (detectCycleInTasks(tasks)) return false;

  if (validateTopologicalOrder(tasks)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Lightweight format — Design Reference validation
// ---------------------------------------------------------------------------

/** @public */
export function validateDesignReferences(
  references: string[],
  designContent: string,
): DesignReferenceValidation {
  const errors: string[] = [];
  const anchorSet = new Set(extractHeadingAnchors(designContent));

  for (const ref of references) {
    if (!DESIGN_REF_PATTERN.test(ref)) {
      errors.push(`Invalid Design Reference format: ${ref}`);
      continue;
    }
    const anchor = ref.replace(/^design\.md#/, "");
    if (!anchorSet.has(anchor)) {
      errors.push(`Design Reference ${ref} not found in design.md`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Unified plan validation dispatcher
// ---------------------------------------------------------------------------

/** @public */
export function validatePlan(
  frontmatter: string,
  tasks: AtomicTask[] | LightweightTask[],
  designContent?: string,
): { valid: boolean; errors: string[]; format: PlanFormat } {
  const format = detectPlanFormat(frontmatter);

  if (format === "lightweight") {
    const lwTasks = tasks as LightweightTask[];
    const errors: string[] = [];

    for (const task of lwTasks) {
      const result = validateLightweightTask(task);
      if (!result.valid) {
        errors.push(`Task ${task.taskNumber}: ${result.errors.join(", ")}`);
      }
    }

    errors.push(...validateDependencies(lwTasks));

    const cycleError = detectCycleInTasks(lwTasks);
    if (cycleError) errors.push(cycleError);

    const topoError = validateTopologicalOrder(lwTasks);
    if (topoError) errors.push(topoError);

    if (designContent) {
      const refs = lwTasks.map((t) => t.designReference);
      const refResult = validateDesignReferences(refs, designContent);
      if (!refResult.valid) {
        errors.push(...refResult.errors);
      }
    }

    return { valid: errors.length === 0, errors, format };
  }

  // Full format
  const fullTasks = tasks as AtomicTask[];
  const fullValid = validatePlanTasks(fullTasks);
  if (fullValid) return { valid: true, errors: [], format };

  const errors: string[] = [];
  for (const task of fullTasks) {
    const result = validateAtomicTask(task);
    if (!result.valid) {
      errors.push(`Task ${task.taskNumber}: ${result.errors.join(", ")}`);
    }
  }
  errors.push(...validateDependencies(fullTasks));
  return { valid: false, errors, format };
}

// ---------------------------------------------------------------------------
// Glossary term normalization (Requirement 1.5)
// ---------------------------------------------------------------------------

/**
 * Regex special characters that must be escaped when embedding a glossary
 * term or alias into a dynamically built `RegExp`.
 */
const REGEX_META_CHARS_REGEX = /[.*+?^${}()|[\]\\]/g;

/**
 * Characters that are considered "word" characters for the purposes of the
 * whole-word match. We include ASCII alphanumerics plus the CJK ranges so
 * that Chinese phrases like "复杂度档位" only match when they are not a
 * substring of a larger CJK run (e.g. they should not match inside
 * "复杂度档位选择器" as the tail "选择器" is still a word character).
 */
const WORD_CHAR_CLASS = "[\\p{L}\\p{N}_]";

/**
 * Escape a literal string so it can be safely embedded into a RegExp.
 */
function escapeForRegExp(value: string): string {
  return value.replace(REGEX_META_CHARS_REGEX, "\\$&");
}

/**
 * Build the ordered list of "surface form → canonical term" replacements
 * for a glossary. Each glossary entry contributes one entry for its
 * canonical `term` and one entry per alias. Entries are sorted by surface
 * length descending so that greedy longest-match replacement wins when two
 * surface forms overlap (e.g. "复杂度档位" must win over "档位").
 */
function buildReplacementTable(glossary: Glossary): Array<{ surface: string; canonical: string }> {
  const table: Array<{ surface: string; canonical: string }> = [];
  for (const entry of glossary.terms) {
    const canonical = entry.term.trim();
    if (canonical.length === 0) continue;
    table.push({ surface: canonical, canonical });
    if (entry.aliases !== undefined) {
      for (const alias of entry.aliases) {
        const trimmed = alias.trim();
        if (trimmed.length === 0) continue;
        // Skip aliases that are identical to the canonical term (nothing
        // to normalize) — comparison is case-insensitive.
        if (trimmed.toLowerCase() === canonical.toLowerCase()) continue;
        table.push({ surface: trimmed, canonical });
      }
    }
  }
  // Longest surface first for greedy matching. Ties broken by surface
  // string order to keep the algorithm deterministic.
  table.sort((a, b) => {
    if (b.surface.length !== a.surface.length) {
      return b.surface.length - a.surface.length;
    }
    return a.surface.localeCompare(b.surface);
  });
  return table;
}

/**
 * Replace the first remaining occurrence (at or after `startIndex`) of
 * `surface` in `text` with `canonical`, but only when the match sits on a
 * word boundary. Returns `null` when no whole-word match exists, or the
 * updated text along with the index immediately after the replacement so
 * the caller can continue scanning.
 */
function replaceWholeWord(
  text: string,
  surface: string,
  canonical: string,
): { text: string; changed: boolean } {
  const escaped = escapeForRegExp(surface);
  // Whole-word = the character immediately before the match (if any) is
  // not a word character, and the character immediately after is not a
  // word character either. We use lookbehind/lookahead with the Unicode
  // `u` flag so CJK characters are treated as word characters.
  const pattern = new RegExp(`(?<!${WORD_CHAR_CLASS})${escaped}(?!${WORD_CHAR_CLASS})`, "giu");

  let changed = false;
  const next = text.replace(pattern, () => {
    changed = true;
    return canonical;
  });
  return { text: next, changed };
}

/**
 * Normalize domain terminology inside a task title string.
 *
 * For each alias (and canonical term) defined in the glossary, this
 * function finds case-insensitive whole-word matches inside `title` and
 * replaces them with the canonical `term` form. When multiple surface
 * forms could match the same region, the longest surface wins (greedy).
 *
 * Guarantees:
 *   - Matches are case-insensitive but the canonical form is written
 *     verbatim (preserving the glossary's chosen casing).
 *   - Surrounding text is unchanged; only the matched spans are rewritten.
 *   - Partial matches inside a larger word are never replaced (e.g. an
 *     alias "档位" will not touch "档位选择器").
 *   - The function is pure: same inputs yield the same output.
 *   - The operation is idempotent: applying it twice gives the same result
 *     as applying it once, because canonical terms already normalize to
 *     themselves.
 *
 * **Validates: Requirements 1.5**
 *
 * @public
 */
export function normalizeTaskTerms(title: string, glossary: Glossary): string {
  if (title.length === 0) return title;
  if (glossary.terms.length === 0) return title;

  const table = buildReplacementTable(glossary);
  let current = title;
  for (const { surface, canonical } of table) {
    const result = replaceWholeWord(current, surface, canonical);
    if (result.changed) {
      current = result.text;
    }
  }
  return current;
}

/**
 * Return a copy of `task` whose `title` field has been normalized against
 * the glossary. All other fields are passed through unchanged.
 * @public
 */
export function normalizeLightweightTask(
  task: LightweightTask,
  glossary: Glossary,
): LightweightTask {
  const normalizedTitle = normalizeTaskTerms(task.title, glossary);
  if (normalizedTitle === task.title) return task;
  return { ...task, title: normalizedTitle };
}

/**
 * Return a copy of `task` whose `title` field has been normalized against
 * the glossary. All other fields are passed through unchanged.
 * @public
 */
export function normalizeAtomicTask(task: AtomicTask, glossary: Glossary): AtomicTask {
  const normalizedTitle = normalizeTaskTerms(task.title, glossary);
  if (normalizedTitle === task.title) return task;
  return { ...task, title: normalizedTitle };
}

// Re-export the glossary types that callers need when working with the
// normalization helpers, so they don't have to import from two modules.
export type { Glossary, GlossaryTerm };

// ---------------------------------------------------------------------------
// Plan Structure Check — split trigger detection
// ---------------------------------------------------------------------------

/** @public */
export interface SplitTriggerResult {
  triggered: boolean;
  reasons: string[];
}

const SPRINT_HEADING_PATTERN = /^###\s+(Sprint|Milestone|Phase|阶段)\s+\S/;
const DELIVERY_TASK_PATTERN = /(regression|回归|独立\s*ship|交付|release|merge.*main)/i;
const CHAINED_DEP_PATTERN = /Sprint\s+\d+\s+依赖\s+Sprint\s+\d+/;

/**
 * Evaluate whether a plan's structure triggers split recommendations.
 *
 * Four trigger conditions (any one suffices):
 *   (a) task count > 15
 *   (b) ≥2 Sprint/Milestone/Phase headings
 *   (c) task names containing delivery keywords
 *   (d) chained Sprint dependencies in execution strategy
 *
 * @public
 */
export function checkPlanStructure(
  tasks: Array<{ id: string; name: string }>,
  headings: string[],
  executionStrategy: string,
): SplitTriggerResult {
  const reasons: string[] = [];

  // (a) task count > 15
  if (tasks.length > 15) {
    reasons.push("任务数 > 15");
  }

  // (b) ≥2 Sprint/Milestone/Phase headings
  const sprintHeadings = headings.filter((h) => SPRINT_HEADING_PATTERN.test(h));
  if (sprintHeadings.length >= 2) {
    reasons.push("多 Sprint 分组");
  }

  // (c) delivery task names
  if (tasks.some((t) => DELIVERY_TASK_PATTERN.test(t.name))) {
    reasons.push("含交付类任务");
  }

  // (d) chained Sprint dependencies
  if (CHAINED_DEP_PATTERN.test(executionStrategy)) {
    reasons.push("链式 Sprint 依赖");
  }

  return { triggered: reasons.length > 0, reasons };
}

// ---------------------------------------------------------------------------
// Expected Output Completeness check (Pack System — R10)
// ---------------------------------------------------------------------------

/** Result of Expected Output completeness check. */
export interface ExpectedOutputResult {
  errors: string[];
  warnings: string[];
}

/** Pattern for Run step lines. */
const RUN_LINE_RE = /^Run:\s*`/;
/** Pattern for Expected output lines. */
const EXPECTED_RE = /^Expected:\s*(exit\s+\d|output\s+contains\s+"|FAIL\s+--\s+")/;
/** Pattern for task heading. */
const TASK_HEADING_RE = /^###\s+Task\s+(\d+)/;

/**
 * Check plan content for Expected Output completeness.
 *
 * Per R10: Every Run step must have an Expected line following it.
 * Legacy plans (isLegacy=true) emit warnings instead of errors.
 *
 * @param planContent - Full plan markdown content
 * @param isLegacy - Whether this is a pre-Sprint-1 plan (warnings only)
 */
export function checkExpectedOutput(planContent: string, isLegacy: boolean): ExpectedOutputResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines = planContent.split("\n");

  let currentTask = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const taskMatch = TASK_HEADING_RE.exec(line);
    if (taskMatch) {
      currentTask = `Task ${taskMatch[1]}`;
      continue;
    }

    if (RUN_LINE_RE.test(line)) {
      // Check if next non-empty line is Expected
      let foundExpected = false;
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        if (lines[j].trim() === "") continue;
        if (EXPECTED_RE.test(lines[j])) {
          foundExpected = true;
          break;
        }
        break;
      }

      if (!foundExpected) {
        const msg = `${currentTask || "Unknown task"}: Run step missing Expected output at line ${i + 1}`;
        if (isLegacy) {
          warnings.push(`[legacy] ${msg}`);
        } else {
          errors.push(msg);
        }
      }
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Three-file tasks.md lock flow (Requirement 4 — T-09.4)
// ---------------------------------------------------------------------------

/**
 * Lock a tasks.md document by upgrading it with auto-generated waves
 * and transitioning status from draft to locked.
 */
export function lockPlan(doc: TasksSeedDocument): TasksSeedDocument {
  const upgraded = upgradeTasksSeed(doc);
  return {
    ...upgraded,
    frontmatter: { ...upgraded.frontmatter, status: "locked" },
  };
}
