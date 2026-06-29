/**
 * @non-production NOT FOR PRODUCTION — in-repo dogfood reference domain.
 *
 * Reservation value objects (REQ-03). Immutable, value-equal, validated at
 * creation. No PII — GuestInfo holds only an anonymized reference (decision
 * security red line #2).
 */

import { InvalidValueError } from "./errors.js";

/** Equality contract for value objects. */
interface ValueObject<T> {
  equals(other: T): boolean;
}

/** A date range representing the guest's stay. */
export class StayPeriod implements ValueObject<StayPeriod> {
  readonly checkInDate: Date;
  readonly checkOutDate: Date;

  constructor(checkInDate: Date, checkOutDate: Date) {
    if (!(checkOutDate.getTime() > checkInDate.getTime())) {
      throw new InvalidValueError("checkOutDate", "must be after checkInDate");
    }
    this.checkInDate = checkInDate;
    this.checkOutDate = checkOutDate;
    Object.freeze(this);
  }

  /** Number of nights in the stay. */
  nights(): number {
    const msPerNight = 24 * 60 * 60 * 1000;
    return Math.round((this.checkOutDate.getTime() - this.checkInDate.getTime()) / msPerNight);
  }

  equals(other: StayPeriod): boolean {
    return (
      this.checkInDate.getTime() === other.checkInDate.getTime() &&
      this.checkOutDate.getTime() === other.checkOutDate.getTime()
    );
  }
}

/** Anonymized guest reference — no name/phone/email (PII-free). */
export class GuestInfo implements ValueObject<GuestInfo> {
  readonly guestRef: string;

  constructor(guestRef: string) {
    if (!guestRef) throw new InvalidValueError("guestRef", "must be non-empty");
    this.guestRef = guestRef;
    Object.freeze(this);
  }

  equals(other: GuestInfo): boolean {
    return this.guestRef === other.guestRef;
  }
}

/** A room assigned to a reservation. */
export class RoomAssignment implements ValueObject<RoomAssignment> {
  readonly roomNumber: string;
  readonly roomType: string;

  constructor(roomNumber: string, roomType: string) {
    if (!roomNumber) throw new InvalidValueError("roomNumber", "must be non-empty");
    this.roomNumber = roomNumber;
    this.roomType = roomType;
    Object.freeze(this);
  }

  equals(other: RoomAssignment): boolean {
    return this.roomNumber === other.roomNumber && this.roomType === other.roomType;
  }
}
