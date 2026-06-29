/**
 * @non-production NOT FOR PRODUCTION — in-repo dogfood reference domain.
 *
 * Reservation aggregate root (REQ-02 + REQ-07).
 *
 * This is the state-machine engine's first real production consumer. The
 * aggregate does NOT hand-roll a transition switch — it loads the
 * reservation.yaml truth source via the engine and asks it whether a
 * (from, event) transition is legal. Business guards (preconditions like
 * payment_captured) are evaluated here, in the aggregate, because the
 * aggregate owns domain knowledge; the engine owns transition-structure
 * legality.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStateMachineDefinition } from "../../state-machine/index.js";
import { GuardFailedError, InvalidTransitionError } from "./errors.js";
import type { ReservationEvent } from "./events.js";

// ── State-machine truth source (resolved once per process) ──────────────
// packs/pms/state-machines/reservation.yaml is the single source of truth for
// legal Reservation transitions. The engine parses it; we add a thin
// lookupTransition helper (the engine exposes load + validate, not a per-
// transition query). This resolves the engine's orphan status (REQ-07).

interface LoadedTransition {
  to: string;
}

interface ReservationMachineLookup {
  /** Find the legal target state for (from, event); null if no such transition. */
  lookupTransition(from: string, event: string): LoadedTransition | null;
}

function loadReservationMachine(): ReservationMachineLookup {
  // Resolve the yaml relative to this module so it works regardless of CWD
  // (e.g. under vitest from repo root, or standalone tsc -p src/domain).
  const here = dirname(fileURLToPath(import.meta.url));
  const yamlPath = resolve(here, "../../../packs/pms/state-machines/reservation.yaml");
  const yaml = readFileSync(yamlPath, "utf-8");
  const def = loadStateMachineDefinition(yaml, yamlPath);
  return {
    lookupTransition(from, event) {
      const t = def.transitions.find((tr) => tr.from === from && tr.event === event);
      return t ? { to: t.to } : null;
    },
  };
}

const machine = loadReservationMachine();

// ── Aggregate ───────────────────────────────────────────────────────────

export type ReservationState =
  | "Booked"
  | "Confirmed"
  | "CheckedIn"
  | "CheckedOut"
  | "NoShow"
  | "Cancelled";

export interface ReservationCtor {
  id: string;
  guestRef: string;
  checkInDate: Date;
  checkOutDate: Date;
}

export class Reservation {
  readonly id: string;
  readonly guestRef: string;
  readonly checkInDate: Date;
  readonly checkOutDate: Date;
  private _state: ReservationState = "Booked";
  private _events: ReservationEvent[] = [];
  private _roomNumber: string | null = null;

  constructor(props: ReservationCtor) {
    this.id = props.id;
    this.guestRef = props.guestRef;
    this.checkInDate = props.checkInDate;
    this.checkOutDate = props.checkOutDate;
  }

  get state(): ReservationState {
    return this._state;
  }

  get roomNumber(): string | null {
    return this._roomNumber;
  }

  /** Returns a defensive copy of collected domain events. */
  aggregateEvents(): ReservationEvent[] {
    return [...this._events];
  }

  // ── Transitions ──────────────────────────────────────────────────────
  // Each method: evaluate guards (domain logic) → ask engine for transition
  // legality → mutate state → record event.

  confirm({ paymentCaptured }: { paymentCaptured: boolean }): void {
    if (!paymentCaptured) throw new GuardFailedError("payment_captured");
    this.apply("ConfirmReservation", "ReservationConfirmed", {});
  }

  autoConfirm({
    depositReceived,
    withinConfirmationWindow,
  }: {
    depositReceived: boolean;
    withinConfirmationWindow: boolean;
  }): void {
    if (!depositReceived) throw new GuardFailedError("deposit_received");
    if (!withinConfirmationWindow) throw new GuardFailedError("within_confirmation_window");
    this.apply("AutoConfirm", "ReservationConfirmed", {});
  }

  checkIn({
    arrivalDateReached,
    roomAssigned,
  }: {
    arrivalDateReached: boolean;
    roomAssigned: boolean;
  }): void {
    if (!arrivalDateReached) throw new GuardFailedError("arrival_date_reached");
    if (!roomAssigned) throw new GuardFailedError("room_assigned");
    this.apply("CheckIn", "GuestCheckedIn", { roomNumber: this._roomNumber ?? "auto" });
  }

  lateCheckIn({ arrivalWithinGracePeriod }: { arrivalWithinGracePeriod: boolean }): void {
    if (!arrivalWithinGracePeriod) throw new GuardFailedError("arrival_within_grace_period");
    this.apply("LateCheckIn", "GuestCheckedIn", { roomNumber: this._roomNumber ?? "auto" });
  }

  earlyCheckIn({
    roomAvailable,
    earlyCheckinApproved,
  }: {
    roomAvailable: boolean;
    earlyCheckinApproved: boolean;
  }): void {
    if (!roomAvailable) throw new GuardFailedError("room_available");
    if (!earlyCheckinApproved) throw new GuardFailedError("early_checkin_approved");
    this.apply("EarlyCheckIn", "GuestCheckedIn", { roomNumber: this._roomNumber ?? "auto" });
  }

  checkOut({ folioSettled }: { folioSettled: boolean }): void {
    if (!folioSettled) throw new GuardFailedError("folio_settled");
    this.apply("CheckOut", "GuestCheckedOut", {});
  }

  cancel({
    withinCancellationWindow,
    withinCancellationPolicy,
  }: {
    withinCancellationWindow?: boolean;
    withinCancellationPolicy?: boolean;
  }): void {
    // The yaml has two cancel transitions depending on current state:
    //   Booked    + CancelBooking     (guard: within_cancellation_window)
    //   Confirmed + CancelReservation (guard: within_cancellation_policy)
    if (this._state === "Booked") {
      if (!withinCancellationWindow) throw new GuardFailedError("within_cancellation_window");
      this.apply("CancelBooking", "ReservationCancelled", { reason: "booking_cancelled" });
    } else if (this._state === "Confirmed") {
      if (!withinCancellationPolicy) throw new GuardFailedError("within_cancellation_policy");
      this.apply("CancelReservation", "ReservationCancelled", { reason: "reservation_cancelled" });
    } else {
      // No legal cancel transition from other states → let apply() throw
      // InvalidTransitionError via the engine.
      this.apply("CancelBooking", "ReservationCancelled", { reason: "booking_cancelled" });
    }
  }

  markNoShow({ arrivalCutoffPassed }: { arrivalCutoffPassed: boolean }): void {
    if (!arrivalCutoffPassed) throw new GuardFailedError("arrival_cutoff_passed");
    this.apply("MarkNoShow", "NoShowMarked", {});
  }

  roomMove(): void {
    // Self-transition; no guard in yaml.
    this.apply("RoomMove", "GuestCheckedIn", { roomNumber: this._roomNumber ?? "moved" });
  }

  modify({ modificationAllowed }: { modificationAllowed: boolean }): void {
    if (!modificationAllowed) throw new GuardFailedError("modification_allowed");
    this.apply("ModifyReservation", "ReservationConfirmed", {});
  }

  // ── Engine-backed transition application ─────────────────────────────

  private apply(
    event: string,
    emitType: ReservationEvent["type"],
    payload: { roomNumber?: string; reason?: string },
  ): void {
    const t = machine.lookupTransition(this._state, event);
    if (!t) {
      throw new InvalidTransitionError(this._state, event);
    }
    this._state = t.to as ReservationState;
    this._events.push(this.buildEvent(emitType, payload));
  }

  private buildEvent(
    type: ReservationEvent["type"],
    payload: { roomNumber?: string; reason?: string },
  ): ReservationEvent {
    const base = { reservationId: this.id, occurredAt: new Date() };
    switch (type) {
      case "GuestCheckedIn":
        return { type, ...base, roomNumber: payload.roomNumber ?? "unknown" };
      case "ReservationCancelled":
        return { type, ...base, reason: payload.reason ?? "unknown" };
      default:
        return { type, ...base };
    }
  }
}
