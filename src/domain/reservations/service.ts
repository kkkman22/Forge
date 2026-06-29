/**
 * @non-production NOT FOR PRODUCTION — in-repo dogfood reference domain.
 *
 * Reservation repository + Application Service (REQ-05 + REQ-06).
 *
 * Security red line #1: the repository is pure in-memory. No SQL string
 * concatenation, no dynamic code evaluation, no database driver. Real
 * persistence is the user's integration point — the impl below is a reference
 * stub (@non-production TODO).
 */

import type { ReservationEvent } from "./events.js";
import type { ReservationState } from "./reservation.js";
import { Reservation } from "./reservation.js";

// ── Repository interface (REQ-05) ───────────────────────────────────────

export interface ReservationRepository {
  findById(id: string): Promise<Reservation | null>;
  save(reservation: Reservation): Promise<void>;
  findConfirmed(): Promise<Reservation[]>;
}

// ── In-memory implementation (pure, no persistence) ─────────────────────
// @non-production TODO: replace with a real persistence adapter (e.g. Postgres,
// event store) in your application. This map-backed impl is a reference stub.

export class InMemoryReservationRepository implements ReservationRepository {
  private readonly store = new Map<string, Reservation>();

  async findById(id: string): Promise<Reservation | null> {
    return this.store.get(id) ?? null;
  }

  async save(reservation: Reservation): Promise<void> {
    // Store by id; in a real adapter this would serialize/aggregate-snapshot.
    this.store.set(reservation.id, reservation);
  }

  async findConfirmed(): Promise<Reservation[]> {
    return [...this.store.values()].filter((r) => r.state === "Confirmed");
  }
}

// ── Application Service (REQ-06) ────────────────────────────────────────
// Orchestrates load → aggregate call → save → return collected events.
// Contains NO business rules of its own — rules live in the aggregate.

export interface BookReservationInput {
  id: string;
  guestRef: string;
  checkInDate: Date;
  checkOutDate: Date;
}

export interface ServiceResult {
  reservationId: string;
  events: ReservationEvent[];
}

export class ReservationService {
  // Public for test inspection of orchestration side effects.
  readonly repo: ReservationRepository;

  constructor(repo: ReservationRepository) {
    this.repo = repo;
  }

  async bookReservation(input: BookReservationInput): Promise<ServiceResult> {
    const reservation = new Reservation({
      id: input.id,
      guestRef: input.guestRef,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
    });
    await this.repo.save(reservation);
    return { reservationId: reservation.id, events: reservation.aggregateEvents() };
  }

  async confirmReservation(
    id: string,
    guard: { paymentCaptured: boolean },
  ): Promise<ServiceResult> {
    return this.mutate(id, (r) => r.confirm(guard));
  }

  async checkInReservation(
    id: string,
    guard: { arrivalDateReached: boolean; roomAssigned: boolean },
  ): Promise<ServiceResult> {
    return this.mutate(id, (r) => r.checkIn(guard));
  }

  async checkOutReservation(id: string, guard: { folioSettled: boolean }): Promise<ServiceResult> {
    return this.mutate(id, (r) => r.checkOut(guard));
  }

  async cancelReservation(id: string, guard: Record<string, boolean>): Promise<ServiceResult> {
    return this.mutate(id, (r) => r.cancel(guard));
  }

  /** Load → apply mutation → save → return events. Central orchestration. */
  private async mutate(id: string, fn: (r: Reservation) => void): Promise<ServiceResult> {
    const reservation = await this.repo.findById(id);
    if (!reservation) throw new Error(`Reservation not found: ${id}`);
    fn(reservation);
    await this.repo.save(reservation);
    return { reservationId: reservation.id, events: reservation.aggregateEvents() };
  }
}

// Re-export state type for consumers that inspect repository results.
export type { ReservationState };
