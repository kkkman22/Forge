/**
 * Bugfix orchestration — generates bugfix design and tasks from a BugfixDocument.
 *
 * Skips variant detection and brownfield checks (bugfix-specific flow).
 * Preserves spec leak detection in lenient mode.
 *
 * Validates: Requirement 14
 */
import type { BugfixDesignDocument, BugfixDocument, SpecBundle, TasksSeedDocument } from "./spec-bundle.js";
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
export declare function runBugfixOrchestration(bundle: SpecBundle): BugfixOrchestrationResult;
