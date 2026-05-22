/**
 * Process Notification Budget (R7).
 * In-memory counter, scoped to a Forge_Session.
 * Monotone non-increasing within a session (R12.2).
 */
export function createBudget(initial) {
    let remaining = initial;
    return {
        /** Consume one budget unit. Returns "ok" or "downgrade". */
        consume() {
            if (remaining <= 0)
                return "downgrade";
            remaining--;
            return "ok";
        },
        /** Remaining budget. */
        available() {
            return remaining;
        },
        /** Reset to a new limit (called at session boundaries, R7.6). */
        reset(newLimit) {
            remaining = newLimit;
        },
    };
}
//# sourceMappingURL=budget.mjs.map