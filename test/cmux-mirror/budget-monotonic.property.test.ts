import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createBudget } from "../../scripts/cmux-mirror/lib/budget.mjs";

describe("budget: monotonic non-increasing property (R12.2, R7.3)", () => {
  it("available budget never increases within a session for any consume sequence", () => {
    fc.assert(
      fc.property(
        fc.record({ initial: fc.integer({ min: 0, max: 50 }) }),
        fc.array(fc.boolean(), { maxLength: 20 }),
        ({ initial }, consumeSequence) => {
          const budget = createBudget(initial);
          let prevAvailable = initial;

          for (const _consume of consumeSequence) {
            budget.consume();
            const currentAvailable = budget.available();
            expect(currentAvailable).toBeLessThanOrEqual(prevAvailable);
            prevAvailable = currentAvailable;
          }
        },
      ),
    );
  });

  it("consume returns 'downgrade' when budget exhausted (R7.3)", () => {
    const budget = createBudget(0);
    expect(budget.consume()).toBe("downgrade");
    expect(budget.consume()).toBe("downgrade");
  });

  it("consume returns 'ok' when budget available (R7.2)", () => {
    const budget = createBudget(3);
    expect(budget.consume()).toBe("ok");
    expect(budget.consume()).toBe("ok");
    expect(budget.consume()).toBe("ok");
    expect(budget.consume()).toBe("downgrade");
  });

  it("reset restores budget to new limit (R7.6)", () => {
    const budget = createBudget(2);
    budget.consume();
    budget.consume();
    expect(budget.consume()).toBe("downgrade");
    budget.reset(5);
    expect(budget.available()).toBe(5);
    expect(budget.consume()).toBe("ok");
  });

  it("cmux_notification_budget=0 always returns downgrade (R7.5)", () => {
    const budget = createBudget(0);
    for (let i = 0; i < 10; i++) {
      expect(budget.consume()).toBe("downgrade");
    }
  });
});
