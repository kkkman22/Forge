/**
 * Plan engine — execution package generation & standalone checks (T-02 拆分自 src/plan.ts).
 *
 * 包含：task 权重分类、execution package 生成、plan 结构检查（split trigger）、
 * expected output 完整性检查、tasks.md lock 流程。
 *
 * 这部分与 task-graph-bridge 无内部耦合（独立子域），但 generateExecutionPackages
 * 消费外部 ../task-graph.js 的 validateGraph/topologicalOrder。
 *
 * 依赖：types + 外部 ../task-graph.js + ../spec-plan-upgrade.js（lockPlan）+ ../spec-bundle.js。
 *
 * @module plan/execution-package
 */

import type { TasksSeedDocument } from "../spec-bundle.js";
import { upgradeTasksSeed } from "../spec-plan-upgrade.js";
import { type TaskGraph, topologicalOrder, validateGraph } from "../task-graph.js";
import type {
  ExecutionPackage,
  ExecutionPackageGenerationResult,
  ExpectedOutputResult,
  GenerateExecutionPackagesOptions,
  OverweightSplitValidation,
  SplitTriggerResult,
  TaskWeight,
  TaskWeightClassification,
  WeightedPlanTask,
} from "./types.js";

export type { TasksSeedDocument } from "../spec-bundle.js";
export { upgradeTasksSeed } from "../spec-plan-upgrade.js";

// ---------------------------------------------------------------------------
// Execution package context control — weight classification
// ---------------------------------------------------------------------------

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
      handoff_path: `.tinkerman/runs/${runId}/packages/${id}.md`,
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
// Plan Structure Check — split trigger detection
// ---------------------------------------------------------------------------

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
