/**
 * T4 — Reservation value objects (REQ-03).
 *
 * Verifies the immutable value objects backing the Reservation aggregate:
 *   - StayPeriod: checkIn/checkout range with nights() + checkout>checkIn guard
 *   - GuestInfo: anonymized guestRef (NO PII fields)
 *   - RoomAssignment: room number/type
 * Value equality is by fields, not identity. All are frozen/readonly.
 *
 * category: unit
 */
import { describe, expect, it } from "vitest";
import { InvalidValueError } from "../src/domain/reservations/errors";
import { GuestInfo, RoomAssignment, StayPeriod } from "../src/domain/reservations/values";

describe("T4: Reservation value objects (REQ-03)", () => {
  describe("StayPeriod", () => {
    it("creates with valid checkIn < checkOut", () => {
      const p = new StayPeriod(new Date("2026-07-01"), new Date("2026-07-04"));
      expect(p.nights()).toBe(3);
    });

    it("rejects checkOut <= checkIn", () => {
      expect(() => new StayPeriod(new Date("2026-07-04"), new Date("2026-07-04"))).toThrow(
        InvalidValueError,
      );
      expect(() => new StayPeriod(new Date("2026-07-05"), new Date("2026-07-04"))).toThrow(
        InvalidValueError,
      );
    });

    it("is immutable (frozen)", () => {
      const p = new StayPeriod(new Date("2026-07-01"), new Date("2026-07-04"));
      expect(Object.isFrozen(p)).toBe(true);
    });

    it("value equality by fields", () => {
      const a = new StayPeriod(new Date("2026-07-01"), new Date("2026-07-04"));
      const b = new StayPeriod(new Date("2026-07-01"), new Date("2026-07-04"));
      expect(a.equals(b)).toBe(true);
    });
  });

  describe("GuestInfo", () => {
    it("holds anonymized guestRef only (no PII fields)", () => {
      const g = new GuestInfo("guest-42");
      expect(g.guestRef).toBe("guest-42");
      // No name/phone/email fields exposed.
      expect((g as unknown as Record<string, unknown>).name).toBeUndefined();
      expect((g as unknown as Record<string, unknown>).phone).toBeUndefined();
      expect((g as unknown as Record<string, unknown>).email).toBeUndefined();
    });

    it("value equality by guestRef", () => {
      expect(new GuestInfo("g1").equals(new GuestInfo("g1"))).toBe(true);
      expect(new GuestInfo("g1").equals(new GuestInfo("g2"))).toBe(false);
    });
  });

  describe("RoomAssignment", () => {
    it("holds roomNumber + roomType", () => {
      const r = new RoomAssignment("101", "Double");
      expect(r.roomNumber).toBe("101");
      expect(r.roomType).toBe("Double");
    });

    it("is immutable", () => {
      expect(Object.isFrozen(new RoomAssignment("101", "Double"))).toBe(true);
    });
  });
});
