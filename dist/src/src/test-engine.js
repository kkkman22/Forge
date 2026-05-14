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
/** All 7 checklist item keys, in order. */
export const CHECKLIST_KEYS = [
    "testsJustRan",
    "allTestsPass",
    "typeCheckPass",
    "lintPass",
    "acceptanceCriteria",
    "noTodoFixme",
    "progressUpdated",
];
/** Human-readable labels for each checklist item. */
export const CHECKLIST_LABELS = {
    testsJustRan: "测试刚运行过",
    allTestsPass: "所有测试通过",
    typeCheckPass: "类型检查通过",
    lintPass: "Lint 通过",
    acceptanceCriteria: "验收标准逐条确认",
    noTodoFixme: "无遗留 TODO/FIXME",
    progressUpdated: "Progress 已更新",
};
// ---------------------------------------------------------------------------
// Pre-completion checklist validation (Property 12)
// ---------------------------------------------------------------------------
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
export function validatePreCompletionChecklist(state) {
    const failedItems = [];
    for (const key of CHECKLIST_KEYS) {
        if (!state[key]) {
            failedItems.push(CHECKLIST_LABELS[key]);
        }
    }
    return {
        passed: failedItems.length === 0,
        failedItems,
    };
}
//# sourceMappingURL=test-engine.js.map