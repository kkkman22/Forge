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

// ---------------------------------------------------------------------------
// Types — Full format (Atomic Task)
// ---------------------------------------------------------------------------

export interface TDDSteps {
  red: { testFile: string; testCode: string; runCommand: string };
  green: { sourceFile: string; sourceCode: string; runCommand: string };
  refactor: string;
}

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
// Types — Lightweight format
// ---------------------------------------------------------------------------

export type PlanFormat = "lightweight" | "full";

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

export interface DesignReferenceEntry {
  anchor: string;
  summary: string;
}

export interface DesignReferenceValidation {
  valid: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const FORBIDDEN_PLACEHOLDERS = [
  "TBD",
  "TODO",
  "待定",
  "后续补充",
  "类似 Task",
  "添加适当的错误处理",
];

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
 */
export function scanForPlaceholders(text: string): string[] {
  const found: string[] = [];
  const lowerText = text.toLowerCase();

  for (const placeholder of FORBIDDEN_PLACEHOLDERS) {
    if (lowerText.includes(placeholder.toLowerCase())) {
      found.push(placeholder);
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
 */
export function validateDependencies(tasks: AtomicTask[]): string[] {
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
  return dependencyErrors.length === 0;
}

// ---------------------------------------------------------------------------
// Lightweight format — format detection
// ---------------------------------------------------------------------------

export function detectPlanFormat(frontmatter: string): PlanFormat {
  const value = extractStringField(frontmatter, "format");
  if (value === "lightweight") return "lightweight";
  return "full";
}

// ---------------------------------------------------------------------------
// Lightweight format — heading anchor extraction
// ---------------------------------------------------------------------------

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

export function validateLightweightPlan(tasks: LightweightTask[]): boolean {
  if (tasks.length === 0) return false;

  const allValid = tasks.every((task) => validateLightweightTask(task).valid);
  if (!allValid) return false;

  const taskNumbers = new Set(tasks.map((t) => t.taskNumber));
  for (const task of tasks) {
    if (task.dependsOn) {
      for (const dep of task.dependsOn) {
        if (!taskNumbers.has(dep)) return false;
      }
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Lightweight format — Design Reference validation
// ---------------------------------------------------------------------------

export function validateDesignReferences(
  references: string[],
  designContent: string,
): DesignReferenceValidation {
  const errors: string[] = [];
  const anchors = extractHeadingAnchors(designContent);

  for (const ref of references) {
    if (!DESIGN_REF_PATTERN.test(ref)) {
      errors.push(`Invalid Design Reference format: ${ref}`);
      continue;
    }
    const anchor = ref.replace(/^design\.md#/, "");
    if (!anchors.includes(anchor)) {
      errors.push(`Design Reference ${ref} not found in design.md`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Unified plan validation dispatcher
// ---------------------------------------------------------------------------

export function validatePlan(
  frontmatter: string,
  tasks: AtomicTask[] | LightweightTask[],
  designContent?: string,
): { valid: boolean; errors: string[]; format: PlanFormat } {
  const format = detectPlanFormat(frontmatter);

  if (format === "lightweight") {
    const lwTasks = tasks as LightweightTask[];
    const planValid = validateLightweightPlan(lwTasks);

    const errors: string[] = [];
    if (!planValid) {
      for (const task of lwTasks) {
        const result = validateLightweightTask(task);
        if (!result.valid) {
          errors.push(`Task ${task.taskNumber}: ${result.errors.join(", ")}`);
        }
      }
      const taskNumbers = new Set(lwTasks.map((t) => t.taskNumber));
      for (const task of lwTasks) {
        if (task.dependsOn) {
          for (const dep of task.dependsOn) {
            if (!taskNumbers.has(dep)) {
              errors.push(`Task ${task.taskNumber} depends on non-existent task ${dep}`);
            }
          }
        }
      }
    }

    if (planValid && designContent) {
      const refs = lwTasks.map((t) => t.designReference);
      const refResult = validateDesignReferences(refs, designContent);
      if (!refResult.valid) {
        return { valid: false, errors: refResult.errors, format };
      }
    }

    return { valid: planValid && errors.length === 0, errors, format };
  }

  // Full format
  const valid = validatePlanTasks(tasks as AtomicTask[]);
  return { valid, errors: valid ? [] : ["One or more tasks failed validation"], format };
}
