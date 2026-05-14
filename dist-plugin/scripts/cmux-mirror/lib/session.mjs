import { createBudget } from "./budget.mjs";

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
export function createSessionTracker({ defaultBudget = 20, onStatusChange } = {}) {
  const states = new Map();
  const budgets = new Map();

  function ensure(wsRef) {
    if (!states.has(wsRef)) {
      states.set(wsRef, "unknown");
    }
  }

  function transition(wsRef, newState) {
    ensure(wsRef);
    const old = states.get(wsRef);
    if (old === newState) return;
    states.set(wsRef, newState);
    // Reset budget on re-activation (R7.6)
    if (newState === "active" && old === "inactive" && budgets.has(wsRef)) {
      budgets.get(wsRef).reset(defaultBudget);
    }
    if (onStatusChange) {
      onStatusChange(wsRef, old, newState);
    }
  }

  return {
    /** Get current state for a workspace (R12.12). */
    getState(wsRef) {
      ensure(wsRef);
      return states.get(wsRef);
    },

    /** Process an event for a workspace. Transitions to 'active' (R16.1, R16.5). */
    onEvent(wsRef, _eventType) {
      transition(wsRef, "active");
    },

    /** Mark idle. Transitions 'active' → 'inactive' (R16.3). No-op otherwise (R16.4, R16.6). */
    tickIdle(wsRef) {
      ensure(wsRef);
      const current = states.get(wsRef);
      if (current === "active") {
        transition(wsRef, "inactive");
      }
    },

    /** Get notification budget for a workspace session (R7). */
    getSessionBudget(wsRef) {
      if (!budgets.has(wsRef)) {
        budgets.set(wsRef, createBudget(defaultBudget));
      }
      return budgets.get(wsRef);
    },
  };
}
