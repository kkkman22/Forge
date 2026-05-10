/**
 * Forge_Session boundary state machine (R16).
 * Per-Workspace_Ref independent states: unknown → active → inactive.
 * Integrates notification budget per session (R7).
 */
/**
 * Create a session tracker.
 * @param {Object} [opts]
 * @param {number} [opts.defaultBudget=20] - Notification budget per session.
 * @param {(wsRef: string, from: string, to: string) => void} [opts.onStatusChange]
 */
export function createSessionTracker({ defaultBudget, onStatusChange }?: {
    defaultBudget?: number | undefined;
    onStatusChange?: ((wsRef: string, from: string, to: string) => void) | undefined;
}): {
    /** Get current state for a workspace (R12.12). */
    getState(wsRef: any): any;
    /** Process an event for a workspace. Transitions to 'active' (R16.1, R16.5). */
    onEvent(wsRef: any, _eventType: any): void;
    /** Mark idle. Transitions 'active' → 'inactive' (R16.3). No-op otherwise (R16.4, R16.6). */
    tickIdle(wsRef: any): void;
    /** Get notification budget for a workspace session (R7). */
    getSessionBudget(wsRef: any): any;
};
