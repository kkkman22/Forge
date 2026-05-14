import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
describe("mirror: session boundary handling (R16)", () => {
    let dir;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), "cmux-session-boundary-"));
    });
    afterEach(() => {
        try {
            rmSync(dir, { recursive: true, force: true });
        }
        catch {
            /* ignore */
        }
    });
    it("session-start resets notification budget (R7.6)", async () => {
        const { createSessionTracker } = await import("../../scripts/cmux-mirror/lib/session.mjs");
        const tracker = createSessionTracker({ defaultBudget: 5 });
        // Activate and consume budget
        tracker.onEvent("ws1", "session_started");
        const budget = tracker.getSessionBudget("ws1");
        expect(budget.available()).toBe(5);
        // Consume some budget
        budget.consume();
        budget.consume();
        budget.consume();
        expect(budget.available()).toBe(2);
        // Simulate going inactive, then re-activate (session boundary)
        tracker.tickIdle("ws1");
        expect(tracker.getState("ws1")).toBe("inactive");
        tracker.onEvent("ws1", "session_started");
        expect(tracker.getState("ws1")).toBe("active");
        // Budget should be reset on re-activation
        expect(budget.available()).toBe(5);
    });
    it("session-end transitions status to inactive (R16.3)", async () => {
        const { createSessionTracker } = await import("../../scripts/cmux-mirror/lib/session.mjs");
        const transitions = [];
        const tracker = createSessionTracker({
            defaultBudget: 20,
            onStatusChange(_wsRef, from, to) {
                transitions.push({ from, to });
            },
        });
        // Start session
        tracker.onEvent("ws1", "session_started");
        expect(tracker.getState("ws1")).toBe("active");
        // End session via idle tick
        tracker.tickIdle("ws1");
        expect(tracker.getState("ws1")).toBe("inactive");
        // Should have recorded transition
        const inactiveTransition = transitions.find((t) => t.to === "inactive");
        expect(inactiveTransition).toEqual({ from: "active", to: "inactive" });
    });
    it("idle-timeout does not transition from unknown state (R16.4)", async () => {
        const { createSessionTracker } = await import("../../scripts/cmux-mirror/lib/session.mjs");
        const tracker = createSessionTracker({ defaultBudget: 20 });
        expect(tracker.getState("ws1")).toBe("unknown");
        // Idle tick on unknown state should be a no-op
        tracker.tickIdle("ws1");
        expect(tracker.getState("ws1")).toBe("unknown");
    });
    it("budget tracks consume and reset correctly", async () => {
        const { createBudget } = await import("../../scripts/cmux-mirror/lib/budget.mjs");
        const budget = createBudget(3);
        expect(budget.available()).toBe(3);
        expect(budget.consume()).toBe("ok");
        expect(budget.consume()).toBe("ok");
        expect(budget.consume()).toBe("ok");
        expect(budget.available()).toBe(0);
        expect(budget.consume()).toBe("downgrade");
        // Reset
        budget.reset(5);
        expect(budget.available()).toBe(5);
        expect(budget.consume()).toBe("ok");
    });
});
//# sourceMappingURL=mirror-session-boundary.test.js.map