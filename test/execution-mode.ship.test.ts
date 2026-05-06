/**
 * Tests for Ship delivery configuration in execution-mode module.
 *
 * Covers:
 *   - parseShipDefaultMethod: all valid values, invalid fallback, undefined
 *   - resolveConfirmation with configOverride for ship_method
 *   - "prompt" override forcing interactive in autonomous mode
 *   - Backward compatibility: no configOverride → original behavior
 *
 * **Validates: Requirements 3.1–3.6, 7.1, 7.5**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ConfirmationPoint } from "../src/execution-mode.js";
import { parseShipDefaultMethod, resolveConfirmation } from "../src/execution-mode.js";

// ---------------------------------------------------------------------------
// parseShipDefaultMethod
// ---------------------------------------------------------------------------

describe("Feature: ship-delivery-unification, parseShipDefaultMethod", () => {
  it("parses all valid delivery methods", () => {
    expect(parseShipDefaultMethod("merge")).toEqual({ method: "merge" });
    expect(parseShipDefaultMethod("push-pr")).toEqual({ method: "push-pr" });
    expect(parseShipDefaultMethod("keep-branch")).toEqual({ method: "keep-branch" });
    expect(parseShipDefaultMethod("prompt")).toEqual({ method: "prompt" });
  });

  it("handles case-insensitive values", () => {
    expect(parseShipDefaultMethod("Merge")).toEqual({ method: "merge" });
    expect(parseShipDefaultMethod("PUSH-PR")).toEqual({ method: "push-pr" });
    expect(parseShipDefaultMethod(" Keep-Branch ")).toEqual({ method: "keep-branch" });
  });

  it("returns keep-branch for undefined input", () => {
    expect(parseShipDefaultMethod(undefined)).toEqual({ method: "keep-branch" });
  });

  it("returns keep-branch with warning for invalid values", () => {
    const result = parseShipDefaultMethod("invalid-method");
    expect(result.method).toBe("keep-branch");
    expect(result.warning).toContain("Invalid ship_default_method");
    expect(result.warning).toContain("invalid-method");
  });

  it("never throws for any string input (property test)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), (input) => {
        const result = parseShipDefaultMethod(input);
        expect(result.method).toBeOneOf(["merge", "push-pr", "keep-branch", "prompt"]);
      }),
      { numRuns: 50 },
    );
  });

  it("always returns a valid DeliveryMethod for undefined input", () => {
    const result = parseShipDefaultMethod(undefined);
    expect(result.method).toBe("keep-branch");
    expect(result.warning).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveConfirmation with configOverride
// ---------------------------------------------------------------------------

describe("Feature: ship-delivery-unification, resolveConfirmation configOverride", () => {
  it("uses configOverride for ship_method in autonomous mode", () => {
    const result = resolveConfirmation("autonomous", "ship_method", {
      ship_method: "merge",
    });
    expect(result).toEqual({ action: "auto", preset: "merge" });
  });

  it("returns wait_for_user when configOverride is 'prompt'", () => {
    const result = resolveConfirmation("autonomous", "ship_method", {
      ship_method: "prompt",
    });
    expect(result).toEqual({ action: "wait_for_user" });
  });

  it("preserves backward compatibility: no configOverride → keep branch", () => {
    const result = resolveConfirmation("autonomous", "ship_method");
    expect(result).toEqual({ action: "auto", preset: "keep branch" });
  });

  it("preserves backward compatibility: non-ship_method points unchanged", () => {
    const points: ConfirmationPoint[] = [
      "router_tier",
      "plan_approval",
      "build_pause",
      "review_p0p1",
    ];

    for (const point of points) {
      const without = resolveConfirmation("autonomous", point);
      const withOverride = resolveConfirmation("autonomous", point, {
        ship_method: "merge",
      });
      expect(withOverride).toEqual(without);
    }
  });

  it("interactive mode always returns wait_for_user regardless of configOverride", () => {
    const result = resolveConfirmation("interactive", "ship_method", {
      ship_method: "merge",
    });
    expect(result).toEqual({ action: "wait_for_user" });
  });
});
