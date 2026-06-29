/**
 * T2 — domain error types (REQ-02/03 prerequisite).
 *
 * Verifies the reservation domain's named error classes exist with the right
 * fields, so the aggregate (T3) and value objects (T4) can throw them.
 *
 * category: unit
 */
import { describe, expect, it } from "vitest";
import {
  GuardFailedError,
  InvalidTransitionError,
  InvalidValueError,
} from "../src/domain/reservations/errors";

describe("T2: domain error types (errors.ts)", () => {
  it("InvalidTransitionError carries from + event", () => {
    const e = new InvalidTransitionError("CheckedOut", "CheckIn");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("InvalidTransitionError");
    expect(e.from).toBe("CheckedOut");
    expect(e.event).toBe("CheckIn");
    expect(e.message).toContain("CheckedOut");
    expect(e.message).toContain("CheckIn");
  });

  it("GuardFailedError carries guard name", () => {
    const e = new GuardFailedError("payment_captured");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("GuardFailedError");
    expect(e.guardName).toBe("payment_captured");
    expect(e.message).toContain("payment_captured");
  });

  it("InvalidValueError carries field name", () => {
    const e = new InvalidValueError("checkOut", "must be after checkIn");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("InvalidValueError");
    expect(e.field).toBe("checkOut");
    expect(e.message).toContain("checkOut");
  });
});
