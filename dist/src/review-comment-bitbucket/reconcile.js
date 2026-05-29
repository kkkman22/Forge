import { computeFindingHash } from "./finding-hash.js";
export function reconcile(input) {
    const { currentFindings, existingTasks, existingComments, autoReconcileResolved, autoReopenRegressed, p0_p1_strategy = "both", } = input;
    // Build maps
    const currentByHash = new Map();
    for (const f of currentFindings) {
        const h = computeFindingHash(f);
        currentByHash.set(h, f);
    }
    // Build existingTaskByHash using max task_id for duplicates (Latest_Task rule)
    const existingTaskByHash = new Map();
    for (const task of existingTasks) {
        if (!task.marker_hash)
            continue; // Skip non-Forge-marker tasks
        const existing = existingTaskByHash.get(task.marker_hash);
        if (!existing ||
            task.task_id.localeCompare(existing.task_id, undefined, { numeric: true }) > 0) {
            existingTaskByHash.set(task.marker_hash, task);
        }
    }
    // Build existingCommentByHash
    const existingCommentByHash = new Map();
    for (const comment of existingComments) {
        if (!comment.marker_hash)
            continue; // Skip non-Forge-marker comments
        existingCommentByHash.set(comment.marker_hash, comment);
    }
    const creates = [];
    const dones = [];
    const reopens = [];
    const skips = [];
    // Process each current finding
    for (const [h, finding] of currentByHash) {
        const task = existingTaskByHash.get(h);
        const comment = existingCommentByHash.get(h);
        if (!task && !comment) {
            // No task AND no comment exists → create
            creates.push({ kind: "create", finding });
        }
        else if (task) {
            // Task exists
            if (task.status === "RESOLVED") {
                if (autoReopenRegressed) {
                    // Task exists, status RESOLVED, autoReopenRegressed=true → reopen
                    const linkedComment = existingCommentByHash.get(h);
                    reopens.push({
                        kind: "reopen",
                        task_id: task.task_id,
                        comment_id: linkedComment?.comment_id,
                        finding,
                    });
                }
                else {
                    // Task exists, status RESOLVED, autoReopenRegressed=false → skip-duplicate
                    skips.push({
                        kind: "skip-duplicate",
                        finding_hash: h,
                        task_id: task.task_id,
                        reason: "resolved-no-reopen",
                    });
                }
            }
            else {
                // Task exists, status OPEN → skip-duplicate
                skips.push({
                    kind: "skip-duplicate",
                    finding_hash: h,
                    task_id: task.task_id,
                    reason: "already-open",
                });
            }
        }
        else {
            // No task but comment exists
            if (p0_p1_strategy === "pr-task") {
                // p0_p1_strategy === "pr-task" → create (only look at PR Task for existence)
                creates.push({ kind: "create", finding });
            }
            else {
                // p0_p1_strategy !== "pr-task" → skip with orphan-comment label
                skips.push({ kind: "skip-duplicate", finding_hash: h, reason: "orphan-comment" });
            }
        }
    }
    // Process each historical task (by hash h) where h NOT in currentByHash
    for (const [h, task] of existingTaskByHash) {
        if (currentByHash.has(h))
            continue; // Skip if finding still present
        if (task.status === "OPEN" && autoReconcileResolved) {
            // status OPEN AND autoReconcileResolved=true → done
            const linkedComment = existingCommentByHash.get(h);
            dones.push({
                kind: "done",
                task_id: task.task_id,
                comment_id: linkedComment?.comment_id,
                finding_hash: h,
            });
        }
        else {
            // Otherwise → skip-duplicate
            skips.push({
                kind: "skip-duplicate",
                finding_hash: h,
                task_id: task.task_id,
                reason: "historical-resolved",
            });
        }
    }
    // has_p0_p1: true iff currentFindings contains any P0 or P1
    const has_p0_p1 = currentFindings.some((f) => f.priority === "P0" || f.priority === "P1");
    return {
        creates,
        dones,
        reopens,
        skips,
        has_p0_p1,
    };
}
//# sourceMappingURL=reconcile.js.map