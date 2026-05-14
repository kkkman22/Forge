/**
 * Process Notification Budget (R7).
 * In-memory counter, scoped to a Forge_Session.
 * Monotone non-increasing within a session (R12.2).
 */
export function createBudget(initial: any): {
    /** Consume one budget unit. Returns "ok" or "downgrade". */
    consume(): "ok" | "downgrade";
    /** Remaining budget. */
    available(): any;
    /** Reset to a new limit (called at session boundaries, R7.6). */
    reset(newLimit: any): void;
};
