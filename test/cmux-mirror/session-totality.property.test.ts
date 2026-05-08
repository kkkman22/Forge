import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createSessionTracker } from "../../scripts/cmux-mirror/lib/session.mjs";

describe("session: state totality (R12.12)", () => {
  it("valid states: unknown, active, inactive — no other states reachable", () => {
    const valid = new Set(["unknown", "active", "inactive"]);
    const tracker = createSessionTracker();
    // Initial state is unknown
    expect(valid.has(tracker.getState("ws:1"))).toBe(true);
  });

  it("initial state is always 'unknown' for any workspace ref", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 64 }), (wsRef) => {
        const tracker = createSessionTracker();
        expect(tracker.getState(wsRef)).toBe("unknown");
      }),
    );
  });
});

describe("session: state transitions (R16.1–R16.8)", () => {
  it("R16.1: onEvent transitions unknown → active", () => {
    const tracker = createSessionTracker();
    tracker.onEvent("ws:1", "status_change");
    expect(tracker.getState("ws:1")).toBe("active");
  });

  it("R16.2: onEvent stays active if already active", () => {
    const tracker = createSessionTracker();
    tracker.onEvent("ws:1", "status_change");
    tracker.onEvent("ws:1", "status_change");
    expect(tracker.getState("ws:1")).toBe("active");
  });

  it("R16.3: tickIdle transitions active → inactive", () => {
    const tracker = createSessionTracker();
    tracker.onEvent("ws:1", "status_change");
    tracker.tickIdle("ws:1");
    expect(tracker.getState("ws:1")).toBe("inactive");
  });

  it("R16.4: tickIdle is no-op on unknown state", () => {
    const tracker = createSessionTracker();
    tracker.tickIdle("ws:1");
    expect(tracker.getState("ws:1")).toBe("unknown");
  });

  it("R16.5: onEvent transitions inactive → active (re-activation)", () => {
    const tracker = createSessionTracker();
    tracker.onEvent("ws:1", "status_change");
    tracker.tickIdle("ws:1");
    expect(tracker.getState("ws:1")).toBe("inactive");
    tracker.onEvent("ws:1", "status_change");
    expect(tracker.getState("ws:1")).toBe("active");
  });

  it("R16.6: tickIdle on inactive stays inactive", () => {
    const tracker = createSessionTracker();
    tracker.onEvent("ws:1", "status_change");
    tracker.tickIdle("ws:1");
    tracker.tickIdle("ws:1");
    expect(tracker.getState("ws:1")).toBe("inactive");
  });

  it("R16.7: per-workspace independence", () => {
    const tracker = createSessionTracker();
    tracker.onEvent("ws:1", "status_change");
    expect(tracker.getState("ws:1")).toBe("active");
    expect(tracker.getState("ws:2")).toBe("unknown");
    tracker.tickIdle("ws:1");
    expect(tracker.getState("ws:1")).toBe("inactive");
    expect(tracker.getState("ws:2")).toBe("unknown");
  });

  it("R16.8: onStatusChange callback fires on transitions", () => {
    const transitions: Array<{ wsRef: string; from: string; to: string }> = [];
    const tracker = createSessionTracker({
      onStatusChange: (wsRef, from, to) => {
        transitions.push({ wsRef, from, to });
      },
    });

    tracker.onEvent("ws:1", "status_change");
    expect(transitions).toEqual([{ wsRef: "ws:1", from: "unknown", to: "active" }]);

    tracker.tickIdle("ws:1");
    expect(transitions).toEqual([
      { wsRef: "ws:1", from: "unknown", to: "active" },
      { wsRef: "ws:1", from: "active", to: "inactive" },
    ]);

    // Re-activate
    tracker.onEvent("ws:1", "status_change");
    expect(transitions).toEqual([
      { wsRef: "ws:1", from: "unknown", to: "active" },
      { wsRef: "ws:1", from: "active", to: "inactive" },
      { wsRef: "ws:1", from: "inactive", to: "active" },
    ]);
  });

  it("no callback when state unchanged", () => {
    const transitions: Array<{ wsRef: string; from: string; to: string }> = [];
    const tracker = createSessionTracker({
      onStatusChange: (wsRef, from, to) => {
        transitions.push({ wsRef, from, to });
      },
    });

    // onEvent on unknown → active fires callback
    tracker.onEvent("ws:1", "status_change");
    // onEvent on active → active does NOT fire callback
    tracker.onEvent("ws:1", "status_change");
    expect(transitions.length).toBe(1);
  });
});

describe("session: budget integration (R7.3, R7.6)", () => {
  it("getSessionBudget returns budget for workspace", () => {
    const tracker = createSessionTracker({ defaultBudget: 5 });
    tracker.onEvent("ws:1", "status_change");
    const budget = tracker.getSessionBudget("ws:1");
    expect(budget).not.toBeNull();
    expect(budget!.available()).toBe(5);
  });

  it("budget resets on re-activation (R7.6)", () => {
    const tracker = createSessionTracker({ defaultBudget: 3 });
    tracker.onEvent("ws:1", "status_change");
    const budget = tracker.getSessionBudget("ws:1")!;
    budget.consume();
    budget.consume();
    expect(budget.available()).toBe(1);
    // Deactivate and re-activate
    tracker.tickIdle("ws:1");
    tracker.onEvent("ws:1", "status_change");
    expect(budget.available()).toBe(3);
  });
});

describe("session: property — any event sequence yields valid state", () => {
  it("for any sequence of onEvent/tickIdle, state is always valid", () => {
    const validStates = new Set(["unknown", "active", "inactive"]);
    type Action = { type: "event" } | { type: "idle" };

    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.constant({ type: "event" as const }),
            fc.constant({ type: "idle" as const }),
          ),
          { maxLength: 50 },
        ),
        (actions) => {
          const tracker = createSessionTracker();
          for (const action of actions) {
            if (action.type === "event") {
              tracker.onEvent("ws:1", "status_change");
            } else {
              tracker.tickIdle("ws:1");
            }
            expect(validStates.has(tracker.getState("ws:1"))).toBe(true);
          }
        },
      ),
    );
  });
});
