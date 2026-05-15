/**
 * Test engine — core logic extracted from forge-test/SKILL.md.
 *
 * Implements:
 *   - validatePreCompletionChecklist: Verifies all 7 checklist items pass
 *   - ChecklistItem enum and ChecklistState type for structured checklist handling
 *
 * Pre-completion checklist (Property 12):
 *   Verification passes ONLY when ALL 7 items are true.
 *   ANY item being false → verification fails.
 *
 * The 7 checklist items:
 *   1. testsJustRan       — Tests were run in the current session
 *   2. allTestsPass       — All tests passed (zero failures)
 *   3. typeCheckPass       — Type check passed (zero errors)
 *   4. lintPass            — Lint passed (zero errors)
 *   5. acceptanceCriteria  — Acceptance criteria confirmed against Spec
 *   6. noTodoFixme         — No leftover TODO/FIXME in changed files
 *   7. progressUpdated     — .forge/progress/ updated with all tasks complete
 */
/**
 * The 7 pre-completion checklist items from forge-test/SKILL.md §2 Layer 3.
 */
export interface ChecklistState {
    testsJustRan: boolean;
    allTestsPass: boolean;
    typeCheckPass: boolean;
    lintPass: boolean;
    acceptanceCriteria: boolean;
    noTodoFixme: boolean;
    progressUpdated: boolean;
}
/** All 7 checklist item keys, in order. */
export declare const CHECKLIST_KEYS: (keyof ChecklistState)[];
/** Human-readable labels for each checklist item. */
export declare const CHECKLIST_LABELS: Record<keyof ChecklistState, string>;
export interface ChecklistResult {
    passed: boolean;
    failedItems: string[];
}
/**
 * Validate the pre-completion checklist.
 *
 * Per SKILL.md §2 Layer 3 and design Property 12:
 *   - ALL 7 items must be true for verification to pass
 *   - ANY item being false → verification fails
 *   - Failed items are listed with human-readable labels
 *
 * Returns { passed, failedItems } where failedItems lists all items that are false.
 */
export declare function validatePreCompletionChecklist(state: ChecklistState): ChecklistResult;
import { type FailureContext } from "./failure-sink.js";
export interface TestLayerFailedInput {
    topic: string;
    tier: "light" | "standard" | "full";
    failedLayer: string;
    failedCases?: string[];
}
export declare function buildTestLayerFailedContext(input: TestLayerFailedInput): FailureContext;
