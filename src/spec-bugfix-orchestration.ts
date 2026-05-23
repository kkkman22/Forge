/**
 * Bugfix orchestration — generates bugfix design and tasks from a BugfixDocument.
 *
 * Skips variant detection and brownfield checks (bugfix-specific flow).
 * Preserves spec leak detection in lenient mode.
 *
 * Validates: Requirement 14
 */

import { isBugfixBundle } from "./spec-bundle.js";
import type {
  BugfixDesignDocument,
  BugfixDocument,
  SpecBundle,
  SpecFileFrontmatter,
  TaskSeed,
  TasksSeedDocument,
} from "./spec-bundle.js";
import { derivePbtTasksFromUnchanged } from "./spec-pbt-derivation.js";

export interface OrchestrationStep {
  phase: "bugfix" | "design" | "tasks";
  status: "draft" | "locked";
  document?: BugfixDocument | BugfixDesignDocument | TasksSeedDocument;
}

export interface BugfixOrchestrationResult {
  steps: OrchestrationStep[];
  variantDetection: boolean;
  brownfieldDetection: boolean;
  specLeakMode: "lenient" | "strict";
}

/**
 * Run bugfix orchestration: bugfix → design → tasks three-step pipeline.
 * Skips variant/brownfield detection; uses lenient spec leak mode.
 */
export function runBugfixOrchestration(bundle: SpecBundle): BugfixOrchestrationResult {
  if (!isBugfixBundle(bundle)) {
    return { steps: [], variantDetection: false, brownfieldDetection: false, specLeakMode: "lenient" };
  }

  const doc = bundle.primary;
  const fm = doc.frontmatter;

  // Step 1: Bugfix document (already locked as primary)
  const bugfixStep: OrchestrationStep = {
    phase: "bugfix",
    status: "locked",
    document: doc,
  };

  // Step 2: Generate design from bugfix
  const designFm: SpecFileFrontmatter & { kind: "bugfix" } = { ...fm, kind: "bugfix" };
  const design: BugfixDesignDocument = {
    frontmatter: designFm,
    rootCause: `[待分析] ${doc.current.map((c) => c.shall).join("; ")}`,
    fixStrategy: `[待规划] 修复 ${doc.expected.map((e) => e.shall).join("; ")}`,
    testProperties: generateTestProperties(doc),
  };
  const designStep: OrchestrationStep = {
    phase: "design",
    status: "draft",
    document: design,
  };

  // Step 3: Generate tasks from unchanged + fix tasks
  const fixTask: TaskSeed = {
    id: "BFX-01",
    title: "Fix root cause",
    goal: `修复: ${doc.current[0]?.shall ?? "unknown"} → ${doc.expected[0]?.shall ?? "unknown"}`,
    related_requirements: [],
    status: "pending",
    category: "implementation",
  };

  const pbtTasks = derivePbtTasksFromUnchanged(bundle);
  const allTasks = [fixTask, ...pbtTasks];

  const tasksDoc: TasksSeedDocument = {
    frontmatter: { ...fm, kind: "bugfix" },
    tasks: allTasks,
  };
  const tasksStep: OrchestrationStep = {
    phase: "tasks",
    status: "draft",
    document: tasksDoc,
  };

  return {
    steps: [bugfixStep, designStep, tasksStep],
    variantDetection: false,
    brownfieldDetection: false,
    specLeakMode: "lenient",
  };
}

function generateTestProperties(doc: BugfixDocument): string {
  const lines: string[] = [];
  for (const u of doc.unchanged) {
    lines.push(`- 当 ${u.when} 时 系统应当 ${u.shall} (regression)`);
  }
  for (const e of doc.expected) {
    lines.push(`- 当 ${e.when} 时 系统应当 ${e.shall} (fix verification)`);
  }
  return lines.join("\n");
}
