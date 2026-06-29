/**
 * @non-production NOT FOR PRODUCTION — in-repo dogfood reference domain.
 *
 * Domain error types for the Reservation aggregate (slice A). These are the
 * named exceptions the aggregate and value objects throw to signal domain
 * rule violations. Pure data — no side effects, no I/O.
 */

/**
 * Thrown when a state transition is not legal per the state-machine definition
 * (e.g. CheckedOut → CheckIn has no matching transition in reservation.yaml).
 */
export class InvalidTransitionError extends Error {
  readonly from: string;
  readonly event: string;

  constructor(from: string, event: string) {
    super(`Illegal transition: no transition from "${from}" on event "${event}"`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.event = event;
  }
}

/**
 * Thrown when a transition guard (a business precondition) is not satisfied
 * (e.g. confirm() called before payment was captured).
 */
export class GuardFailedError extends Error {
  readonly guardName: string;

  constructor(guardName: string) {
    super(`Guard failed: "${guardName}" not satisfied`);
    this.name = "GuardFailedError";
    this.guardName = guardName;
  }
}

/**
 * Thrown when a value object fails its creation invariant
 * (e.g. StayPeriod with checkOut ≤ checkIn).
 */
export class InvalidValueError extends Error {
  readonly field: string;

  constructor(field: string, reason: string) {
    super(`Invalid value for "${field}": ${reason}`);
    this.name = "InvalidValueError";
    this.field = field;
  }
}
