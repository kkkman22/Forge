/**
 * Plan engine — validation (T-02 拆分自 src/plan.ts).
 *
 * 包含：AtomicTask/LightweightTask/依赖/拓扑序/spec-locked/design-ref 校验，
 * 及统一调度器 validatePlan。
 *
 * 依赖方向（DAG）：format（scanForPlaceholders/detectPlanFormat/extractHeadingAnchors）
 * + task-graph-bridge（detectCycleInTasks/validateTopologicalOrder）+ types。
 * validate 不被 format/task-graph-bridge 反向依赖，无环。
 *
 * @module plan/validate
 */

import { detectPlanFormat, extractHeadingAnchors, scanForPlaceholders } from "./format.js";
import { detectCycleInTasks, validateTopologicalOrder } from "./task-graph-bridge.js";
import type {
  AtomicTask,
  DesignReferenceValidation,
  LightweightTask,
  PlanFormat,
} from "./types.js";

const MIN_ESTIMATED_MINUTES = 2;
const MAX_ESTIMATED_MINUTES = 5;

const DESIGN_REF_PATTERN = /^design\.md#[a-z0-9\-_]+$/;

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
// Lightweight format — task validation
// ---------------------------------------------------------------------------

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
