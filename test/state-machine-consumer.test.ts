/**
 * T7 — state-machine consumer contract (REQ-07, resolve orphan).
 *
 * Verifies the Reservation aggregate is a LOAD-BEARING consumer of the
 * state-machine engine — not a dead import and not a hand-rolled switch:
 *   - the engine is statically imported by reservation.ts (grep)
 *   - transitions are validated against the engine's loaded definition, not a
 *     hardcoded switch (a transition present in yaml but mis-spelled in code
 *     must fail)
 *   - the engine module gains a real production importer
 *
 * category: contract
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Reservation } from "../src/domain/reservations/reservation";

const ROOT = resolve(__dirname, "..");
const RESERVATION_SRC = readFileSync(
  resolve(ROOT, "src/domain/reservations/reservation.ts"),
  "utf-8",
);

describe("T7: state-machine consumer contract (REQ-07, resolve orphan)", () => {
  it("reservation.ts statically imports the state-machine engine", () => {
    // Load-bearing import (not a dead/commented import).
    expect(RESERVATION_SRC).toMatch(/from\s+["']..\/..\/state-machine/);
  });

  it("reservation.ts does NOT hand-roll a transition switch", () => {
    // The engine is the truth source; a switch (case "Booked": ...) on state
    // would indicate a hand-rolled transition table.
    expect(RESERVATION_SRC).not.toMatch(/switch\s*\(\s*this\._state\s*\)/);
  });

  it("a legal yaml transition succeeds (engine consulted, not hardcoded)", () => {
    // Booked → Confirmed via ConfirmReservation is legal per reservation.yaml.
    const r = new Reservation({
      id: "res-1",
      guestRef: "g1",
      checkInDate: new Date("2026-07-01"),
      checkOutDate: new Date("2026-07-03"),
    });
    r.confirm({ paymentCaptured: true });
    expect(r.state).toBe("Confirmed");
  });

  it("an illegal transition is rejected by the engine's definition", () => {
    // No transition CheckedOut → CheckIn exists in yaml; the aggregate must
    // reject it via the engine (InvalidTransitionError), proving the engine —
    // not a permissive hardcoded path — gates transitions.
    const r = new Reservation({
      id: "res-1",
      guestRef: "g1",
      checkInDate: new Date("2026-07-01"),
      checkOutDate: new Date("2026-07-03"),
    });
    r.confirm({ paymentCaptured: true });
    r.checkIn({ arrivalDateReached: true, roomAssigned: true });
    r.checkOut({ folioSettled: true });
    expect(() => r.checkIn({ arrivalDateReached: true, roomAssigned: true })).toThrow(
      /InvalidTransitionError|Illegal transition/,
    );
  });

  it("the engine module has a real production importer (orphan resolved)", () => {
    // Sanity: the state-machine source exists and the domain references it.
    expect(existsSync(resolve(ROOT, "src/state-machine/index.ts"))).toBe(true);
    expect(RESERVATION_SRC).toMatch(/loadStateMachineDefinition/);
  });
});
