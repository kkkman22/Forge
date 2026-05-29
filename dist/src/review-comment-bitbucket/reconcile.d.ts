import type { ActionPlan, CommentRecord, Finding, TaskRecord } from "./types.js";
export declare function reconcile(input: {
    currentFindings: Finding[];
    existingTasks: TaskRecord[];
    existingComments: CommentRecord[];
    autoReconcileResolved: boolean;
    autoReopenRegressed: boolean;
    p0_p1_strategy?: "both" | "pr-task" | "inline-only";
}): ActionPlan;
