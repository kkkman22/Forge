import { phaseToIcon, tierToColor } from "./payload.mjs";
/**
 * Compare previous and next CanonicalSidebarPayload, emit cmux CLI commands.
 * Only emits commands for changed state (R12.10).
 */
function shallowDiff(a, b) {
    if (a === b)
        return false;
    if (a === null || b === null)
        return true;
    if (typeof a !== "object" || typeof b !== "object")
        return true;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length)
        return true;
    return keysA.some((k) => a[k] !== b[k]);
}
/**
 * Emit commands for state transitions (R2.1, R2.2).
 * Returns array of { method, params } objects.
 */
export function emitCommands(prev, next) {
    const cmds = [];
    // Phase change → set_status
    if (prev.phase !== next.phase) {
        cmds.push({
            method: "set_status",
            params: {
                text: `Forge: ${next.phase}`,
                icon: phaseToIcon(next.phase),
            },
        });
    }
    // Tier change → update status color
    if (prev.tier !== next.tier && next.tier) {
        const color = tierToColor(next.tier);
        if (color) {
            cmds.push({
                method: "set_status",
                params: {
                    text: `Forge: ${next.phase ?? "unknown"} [${next.tier}]`,
                    icon: phaseToIcon(next.phase ?? "unknown"),
                    color,
                },
            });
        }
    }
    // Progress change → set_progress
    if (shallowDiff(prev.progress, next.progress) && next.progress && next.progress.total > 0) {
        const pct = Math.round((next.progress.done / next.progress.total) * 100);
        cmds.push({
            method: "set_progress",
            params: {
                percent: pct,
                label: `${next.progress.done}/${next.progress.total}`,
            },
        });
    }
    // Review completion → notification
    if (prev.review && next.review && !prev.review.completed && next.review.completed) {
        cmds.push({
            method: "notification.create",
            params: {
                title: "Review Complete",
                body: `Review for "${next.task ?? "unknown"}" finished.`,
            },
        });
    }
    // Any state change → sidebar_state with full payload
    if (cmds.length > 0 || shallowDiff(prev, next)) {
        const items = [];
        if (next.task) {
            items.push({
                label: "Task",
                value: next.task,
                icon: phaseToIcon(next.phase ?? "unknown"),
            });
        }
        if (next.progress && next.progress.total > 0) {
            items.push({
                label: "Progress",
                value: `${next.progress.done}/${next.progress.total}`,
                icon: "list.bullet",
            });
        }
        if (next.review) {
            const doneLayers = Object.values(next.review.layers).filter((s) => s === "done").length;
            const totalLayers = Object.keys(next.review.layers).length;
            items.push({
                label: "Review",
                value: `${doneLayers}/${totalLayers}`,
                icon: next.review.completed ? "checkmark.seal" : "checkmark.seal",
            });
        }
        if (items.length > 0) {
            cmds.push({
                method: "sidebar_state",
                params: { items },
            });
        }
    }
    return cmds;
}
//# sourceMappingURL=emitter.mjs.map