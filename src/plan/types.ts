/**
 * Plan engine — type definitions (T-02 拆分自 src/plan.ts).
 *
 * 纯类型层，被 plan/ 下所有子模块依赖。无运行时逻辑。
 *
 * @module plan/types
 */

import type { Glossary, GlossaryTerm } from "../glossary.js";

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
// Plan Structure Check types
// ---------------------------------------------------------------------------

/** @public */
export interface SplitTriggerResult {
  triggered: boolean;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Expected Output Completeness types
// ---------------------------------------------------------------------------

/** Result of Expected Output completeness check. */
export interface ExpectedOutputResult {
  errors: string[];
  warnings: string[];
}

// Re-export the glossary types that callers need when working with the
// normalization helpers, so they don't have to import from two modules.
export type { Glossary, GlossaryTerm };
