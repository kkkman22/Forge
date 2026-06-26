/**
 * Plan engine — re-exports from sub-modules for backward compatibility (T-02).
 *
 * All public exports from the plan/ sub-modules are re-exported here so existing
 * `import { ... } from "./plan.js"` continues to work unchanged. This shim is
 * required because moduleResolution "bundler" resolves the explicit `.js`
 * extension to this file rather than the plan/ directory's index.ts.
 *
 * Sub-modules (extracted from the original 1127-line plan.ts for independent
 * testability and reduced change radius):
 *   - plan/types.ts              — Type definitions (pure, no logic)
 *   - plan/format.ts             — Placeholder scan, format detection, glossary normalization
 *   - plan/task-graph-bridge.ts  — number-keyed dependency graph conversion/validation
 *   - plan/execution-package.ts  — Weight classification, package generation, structure checks, lock
 *   - plan/validate.ts           — AtomicTask/LightweightTask/dependency/topo/design-ref validation
 */

export type { TasksSeedDocument } from "./plan/execution-package.js";
// Execution package — weight classification, package generation, checks, lock
export {
  checkExpectedOutput,
  checkPlanStructure,
  classifyTaskWeight,
  generateExecutionPackages,
  lockPlan,
  TASK_WEIGHT_THRESHOLDS,
  upgradeTasksSeed,
  validateOverweightTaskSplits,
} from "./plan/execution-package.js";
// Format — placeholder scan, format detection, glossary normalization
export {
  detectPlanFormat,
  escapeForRegExp,
  extractHeadingAnchors,
  FORBIDDEN_PLACEHOLDERS,
  normalizeAtomicTask,
  normalizeLightweightTask,
  normalizeTaskTerms,
  scanForPlaceholders,
} from "./plan/format.js";
// Task-graph bridge — number-keyed dependency graph conversion/validation
export {
  detectCycleInTasks,
  toTaskGraph,
  validateTopologicalOrder,
} from "./plan/task-graph-bridge.js";
// Types — pure type layer
export type {
  AtomicTask,
  DesignReferenceEntry,
  DesignReferenceValidation,
  ExecutionPackage,
  ExecutionPackageGenerationResult,
  ExpectedOutputResult,
  GenerateExecutionPackagesOptions,
  Glossary,
  GlossaryTerm,
  LightweightTask,
  OverweightSplitValidation,
  PlanFormat,
  SplitTriggerResult,
  TaskRisk,
  TaskTestScope,
  TaskWeight,
  TaskWeightClassification,
  TDDSteps,
  WeightedPlanTask,
} from "./plan/types.js";

// Validate — AtomicTask/LightweightTask/dependency/topo/design-ref validation + dispatcher
export {
  validateAtomicTask,
  validateDependencies,
  validateDesignReferences,
  validateLightweightPlan,
  validateLightweightTask,
  validatePlan,
  validatePlanTasks,
  validateSpecLocked,
} from "./plan/validate.js";
