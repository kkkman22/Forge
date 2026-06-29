/**
 * T9 (part 2) / REQ-10 — BDD scenarios for the Reservation aggregate.
 *
 * Given/When/Then scenarios covering the 10 key reservation paths from
 * design §2.4, drawn from packs/pms/scenarios/reservation/. Each scenario
 * asserts behavior end-to-end through the aggregate's public API.
 *
 * category: unit (BDD-style)
 */
import { describe, expect, it } from "vitest";
import { GuardFailedError, InvalidTransitionError } from "../src/domain/reservations/errors";
import { Reservation } from "../src/domain/reservations/reservation";

function booking(): Reservation {
  return new Reservation({
    id: "res-1",
    guestRef: "guest-1",
    checkInDate: new Date("2026-07-01"),
    checkOutDate: new Date("2026-07-03"),
  });
}

describe("REQ-10: Reservation BDD scenarios", () => {
  it("S1 — standard stay: Booked → Confirmed → CheckedIn → CheckedOut", () => {
    const r = booking();
    expect(r.state).toBe("Booked");

    r.confirm({ paymentCaptured: true });
    expect(r.state).toBe("Confirmed");

    r.checkIn({ arrivalDateReached: true, roomAssigned: true });
    expect(r.state).toBe("CheckedIn");

    r.checkOut({ folioSettled: true });
    expect(r.state).toBe("CheckedOut");

    const types = r.aggregateEvents().map((e) => e.type);
    expect(types).toEqual(["ReservationConfirmed", "GuestCheckedIn", "GuestCheckedOut"]);
  });

  it("S2 — cancel before confirmation: Booked → Cancelled (within window)", () => {
    const r = booking();
    r.cancel({ withinCancellationWindow: true });
    expect(r.state).toBe("Cancelled");
    expect(r.aggregateEvents().some((e) => e.type === "ReservationCancelled")).toBe(true);
  });

  it("S3 — cancel after confirmation: Confirmed → Cancelled (within policy)", () => {
    const r = booking();
    r.confirm({ paymentCaptured: true });
    r.cancel({ withinCancellationPolicy: true });
    expect(r.state).toBe("Cancelled");
  });

  it("S4 — no-show: Confirmed → NoShow (arrival cutoff passed)", () => {
    const r = booking();
    r.confirm({ paymentCaptured: true });
    r.markNoShow({ arrivalCutoffPassed: true });
    expect(r.state).toBe("NoShow");
    expect(r.aggregateEvents().some((e) => e.type === "NoShowMarked")).toBe(true);
  });

  it("S5 — early check-in: Booked → CheckedIn (room available + approved)", () => {
    const r = booking();
    r.earlyCheckIn({ roomAvailable: true, earlyCheckinApproved: true });
    expect(r.state).toBe("CheckedIn");
  });

  it("S6 — late check-in: Confirmed → CheckedIn (within grace period)", () => {
    const r = booking();
    r.confirm({ paymentCaptured: true });
    r.lateCheckIn({ arrivalWithinGracePeriod: true });
    expect(r.state).toBe("CheckedIn");
  });

  it("S7 — auto-confirm: Booked → Confirmed (deposit + window)", () => {
    const r = booking();
    r.autoConfirm({ depositReceived: true, withinConfirmationWindow: true });
    expect(r.state).toBe("Confirmed");
  });

  it("S8 — modify reservation: Confirmed → Confirmed (modification allowed)", () => {
    const r = booking();
    r.confirm({ paymentCaptured: true });
    r.modify({ modificationAllowed: true });
    expect(r.state).toBe("Confirmed");
  });

  it("S9 — room move: CheckedIn → CheckedIn (self-transition)", () => {
    const r = booking();
    r.confirm({ paymentCaptured: true });
    r.checkIn({ arrivalDateReached: true, roomAssigned: true });
    r.roomMove();
    expect(r.state).toBe("CheckedIn");
  });

  it("S10 — illegal transition rejected: CheckedOut → CheckIn throws", () => {
    const r = booking();
    r.confirm({ paymentCaptured: true });
    r.checkIn({ arrivalDateReached: true, roomAssigned: true });
    r.checkOut({ folioSettled: true });
    expect(() => r.checkIn({ arrivalDateReached: true, roomAssigned: true })).toThrow(
      InvalidTransitionError,
    );
  });

  it("S10b — guard rejection: confirm without payment throws GuardFailedError", () => {
    const r = booking();
    expect(() => r.confirm({ paymentCaptured: false })).toThrow(GuardFailedError);
    expect(r.state).toBe("Booked");
  });
});
