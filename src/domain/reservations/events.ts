/**
 * @non-production NOT FOR PRODUCTION — in-repo dogfood reference domain.
 *
 * Reservation domain events (REQ-04). Emitted by the aggregate when a state
 * transition commits a business fact. Payloads carry NO PII — only the
 * reservation id, occurrence time, and minimal business fields (decision
 * security red line #2).
 */

export interface DomainEvent {
  readonly type: string;
  readonly reservationId: string;
  readonly occurredAt: Date;
}

export interface ReservationConfirmed extends DomainEvent {
  readonly type: "ReservationConfirmed";
}

export interface GuestCheckedIn extends DomainEvent {
  readonly type: "GuestCheckedIn";
  readonly roomNumber: string;
}

export interface GuestCheckedOut extends DomainEvent {
  readonly type: "GuestCheckedOut";
}

export interface ReservationCancelled extends DomainEvent {
  readonly type: "ReservationCancelled";
  readonly reason: string;
}

export interface NoShowMarked extends DomainEvent {
  readonly type: "NoShowMarked";
}

export type ReservationEvent =
  | ReservationConfirmed
  | GuestCheckedIn
  | GuestCheckedOut
  | ReservationCancelled
  | NoShowMarked;
