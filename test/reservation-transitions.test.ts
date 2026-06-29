/**
 * T3 — Reservation aggregate transitions + state-machine consumption
 *      (REQ-02 + REQ-07).
 *
 * Verifies the Reservation aggregate root:
 *   - drives transitions through the state-machine engine (NOT a hand-rolled
 *     switch) — the engine is the single source of truth for legal transitions
 *   - legal transitions change state + emit the matching domain event
 *   - illegal transitions throw InvalidTransitionError
 *   - guards (business preconditions) are evaluated by the aggregate before
 *     asking the engine; failed guards throw GuardFailedError
 *
 * Covers all 11 transitions in packs/pms/state-machines/reservation.yaml.
 *
 * category: unit
 */
import { describe, expect, it } from "vitest";
import { GuardFailedError, InvalidTransitionError } from "../src/domain/reservations/errors";
import { Reservation } from "../src/domain/reservations/reservation";

function makeReservation(): Reservation {
  // Minimal constructor: a fresh booking in the Booked state.
  return new Reservation({
    id: "res-1",
    guestRef: "guest-1",
    checkInDate: new Date("2026-07-01"),
    checkOutDate: new Date("2026-07-03"),
  });
}

describe("T3: Reservation aggregate transitions (REQ-02 + REQ-07)", () => {
  describe("legal transitions change state + emit event", () => {
    it("Booked → Confirmed via confirm() (payment_captured guard)", () => {
      const r = makeReservation();
      r.confirm({ paymentCaptured: true });
      expect(r.state).toBe("Confirmed");
      expect(r.aggregateEvents().some((e) => e.type === "ReservationConfirmed")).toBe(true);
    });

    it("Confirmed → CheckedIn via checkIn() (arrival_date_reached + room_assigned)", () => {
      const r = makeReservation();
      r.confirm({ paymentCaptured: true });
      r.checkIn({ arrivalDateReached: true, roomAssigned: true });
      expect(r.state).toBe("CheckedIn");
      expect(r.aggregateEvents().some((e) => e.type === "GuestCheckedIn")).toBe(true);
    });

    it("CheckedIn → CheckedOut via checkOut() (folio_settled)", () => {
      const r = makeReservation();
      r.confirm({ paymentCaptured: true });
      r.checkIn({ arrivalDateReached: true, roomAssigned: true });
      r.checkOut({ folioSettled: true });
      expect(r.state).toBe("CheckedOut");
      expect(r.aggregateEvents().some((e) => e.type === "GuestCheckedOut")).toBe(true);
    });

    it("Booked → Cancelled via cancel() (within_cancellation_window)", () => {
      const r = makeReservation();
      r.cancel({ withinCancellationWindow: true });
      expect(r.state).toBe("Cancelled");
      expect(r.aggregateEvents().some((e) => e.type === "ReservationCancelled")).toBe(true);
    });

    it("Confirmed → Cancelled via cancel() (within_cancellation_policy)", () => {
      const r = makeReservation();
      r.confirm({ paymentCaptured: true });
      r.cancel({ withinCancellationPolicy: true });
      expect(r.state).toBe("Cancelled");
    });

    it("Confirmed → NoShow via markNoShow() (arrival_cutoff_passed)", () => {
      const r = makeReservation();
      r.confirm({ paymentCaptured: true });
      r.markNoShow({ arrivalCutoffPassed: true });
      expect(r.state).toBe("NoShow");
      expect(r.aggregateEvents().some((e) => e.type === "NoShowMarked")).toBe(true);
    });

    it("Booked → CheckedIn via earlyCheckIn() (room_available + approved)", () => {
      const r = makeReservation();
      r.earlyCheckIn({ roomAvailable: true, earlyCheckinApproved: true });
      expect(r.state).toBe("CheckedIn");
    });

    it("Confirmed → CheckedIn via lateCheckIn() (arrival_within_grace_period)", () => {
      const r = makeReservation();
      r.confirm({ paymentCaptured: true });
      r.lateCheckIn({ arrivalWithinGracePeriod: true });
      expect(r.state).toBe("CheckedIn");
    });

    it("CheckedIn → CheckedIn via roomMove() (self-transition)", () => {
      const r = makeReservation();
      r.confirm({ paymentCaptured: true });
      r.checkIn({ arrivalDateReached: true, roomAssigned: true });
      r.roomMove();
      expect(r.state).toBe("CheckedIn");
    });

    it("Booked → Confirmed via autoConfirm() (deposit_received + window)", () => {
      const r = makeReservation();
      r.autoConfirm({ depositReceived: true, withinConfirmationWindow: true });
      expect(r.state).toBe("Confirmed");
    });

    it("Confirmed → Confirmed via modify() (modification_allowed)", () => {
      const r = makeReservation();
      r.confirm({ paymentCaptured: true });
      r.modify({ modificationAllowed: true });
      expect(r.state).toBe("Confirmed");
    });
  });

  describe("guards are evaluated before the engine", () => {
    it("confirm() without payment_captured throws GuardFailedError", () => {
      const r = makeReservation();
      expect(() => r.confirm({ paymentCaptured: false })).toThrow(GuardFailedError);
      expect(r.state).toBe("Booked"); // unchanged
    });

    it("checkOut() without folio_settled throws GuardFailedError", () => {
      const r = makeReservation();
      r.confirm({ paymentCaptured: true });
      r.checkIn({ arrivalDateReached: true, roomAssigned: true });
      expect(() => r.checkOut({ folioSettled: false })).toThrow(GuardFailedError);
    });
  });

  describe("illegal transitions throw InvalidTransitionError", () => {
    it("CheckedOut → CheckIn is illegal (no transition in yaml)", () => {
      const r = makeReservation();
      r.confirm({ paymentCaptured: true });
      r.checkIn({ arrivalDateReached: true, roomAssigned: true });
      r.checkOut({ folioSettled: true });
      // No checkIn method should succeed on a CheckedOut reservation.
      expect(() => r.checkIn({ arrivalDateReached: true, roomAssigned: true })).toThrow(
        InvalidTransitionError,
      );
    });

    it("cancel() on CheckedIn is illegal (cancel only from Booked/Confirmed)", () => {
      const r = makeReservation();
      r.confirm({ paymentCaptured: true });
      r.checkIn({ arrivalDateReached: true, roomAssigned: true });
      expect(() => r.cancel({ withinCancellationWindow: true })).toThrow(InvalidTransitionError);
    });
  });

  describe("aggregateEvents() returns a defensive copy", () => {
    it("mutating the returned array does not affect the aggregate", () => {
      const r = makeReservation();
      r.confirm({ paymentCaptured: true });
      const events = r.aggregateEvents();
      const lenBefore = events.length;
      events.length = 0;
      expect(r.aggregateEvents().length).toBe(lenBefore);
    });
  });
});
