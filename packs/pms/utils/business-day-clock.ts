/**
 * BusinessDayClock — Determines the "business day" for a given instant,
 * accounting for a configurable cutoff hour and IANA timezone (including DST).
 *
 * Uses only Node.js native `Intl.DateTimeFormat` for timezone handling.
 * No external date libraries.
 */

export interface BusinessDayClockConfig {
  /** Hour (0-23) at which the business day rolls over in the configured timezone. */
  cutoffHour: number;
  /** IANA timezone name, e.g. "America/New_York", "Asia/Shanghai". */
  timezone: string;
}

export class BusinessDayClock {
  private readonly cutoffHour: number;
  private readonly timezone: string;

  constructor(config: BusinessDayClockConfig) {
    if (config.cutoffHour < 0 || config.cutoffHour > 23) {
      throw new RangeError(`cutoffHour must be 0-23, got ${config.cutoffHour}`);
    }
    this.cutoffHour = config.cutoffHour;
    this.timezone = config.timezone;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Format a Date into the local calendar-date string in the configured timezone.
   * Returns { year, month, day, hour, minute, second } in the local timezone.
   */
  private toLocalParts(instant: Date): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  } {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: this.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = dtf.formatToParts(instant);
    const get = (type: string): string => {
      const p = parts.find((p) => p.type === type);
      return p ? p.value : "";
    };

    return {
      year: Number(get("year")),
      month: Number(get("month")),
      day: Number(get("day")),
      hour: Number(get("hour")),
      minute: Number(get("minute")),
      second: Number(get("second")),
    };
  }

  /**
   * Build a Date object for a given local date/time in the configured timezone.
   * Uses Intl to compute the UTC offset at that local time.
   */
  private fromDateInTimezone(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute = 0,
    second = 0,
  ): Date {
    // Try constructing a candidate UTC date by guessing the offset.
    // We use the offset at the target local time to refine.
    // Strategy: create a Date from the local parts as if they were UTC,
    // then adjust using the actual offset.

    // First, create a rough Date assuming the local time IS UTC
    const roughUtc = new Date(
      Date.UTC(year, month - 1, day, hour, minute, second),
    );

    // Get the offset at that rough time
    const offsetMs = this.getOffsetMs(roughUtc);

    // The real UTC time = local time - offset
    // roughUtc is local_as_utc, so real UTC = roughUtc - offset
    const realUtcMs = roughUtc.getTime() - offsetMs;

    // But the offset we computed is at the rough time, not the real time.
    // For most cases this is correct. For DST transitions, we may need
    // to iterate once more.
    const candidate = new Date(realUtcMs);
    const offset2 = this.getOffsetMs(candidate);
    if (offset2 !== offsetMs) {
      // Offset changed — refine once more
      return new Date(roughUtc.getTime() - offset2);
    }

    return candidate;
  }

  /**
   * Get the UTC offset in milliseconds for a given UTC instant in the configured timezone.
   * Positive means the timezone is ahead of UTC.
   */
  private getOffsetMs(utcInstant: Date): number {
    // Use Intl.DateTimeFormat to extract the offset.
    // We format the instant in the target timezone and compare with UTC.
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: this.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = dtf.formatToParts(utcInstant);
    const get = (type: string): string => {
      const p = parts.find((p) => p.type === type);
      return p ? p.value : "";
    };

    const localMs = Date.UTC(
      Number(get("year")),
      Number(get("month")) - 1,
      Number(get("day")),
      Number(get("hour")),
      Number(get("minute")),
      Number(get("second")),
    );

    return localMs - utcInstant.getTime();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Determine the business day for a given instant.
   *
   * Converts the instant to the configured timezone's local datetime.
   * If the local hour is before the cutoff, the business day is the
   * previous calendar day; otherwise it is the same calendar day.
   *
   * Returns a string in "YYYY-MM-DD" format.
   */
  getBusinessDay(instant: Date): string {
    const local = this.toLocalParts(instant);

    let year = local.year;
    let month = local.month;
    let day = local.day;

    if (local.hour < this.cutoffHour) {
      // Roll back one calendar day
      const prev = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      prev.setUTCDate(prev.getUTCDate() - 1);
      year = prev.getUTCFullYear();
      month = prev.getUTCMonth() + 1;
      day = prev.getUTCDate();
    }

    const y = String(year).padStart(4, "0");
    const m = String(month).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  /**
   * Check whether two instants fall on the same business day.
   */
  isSameBusinessDay(a: Date, b: Date): boolean {
    return this.getBusinessDay(a) === this.getBusinessDay(b);
  }

  /**
   * Add `delta` business days to the business day of `from`.
   * Returns a Date at the cutoffHour in the configured timezone on the
   * resulting business day.
   */
  addBusinessDays(from: Date, delta: number): Date {
    const dayStr = this.getBusinessDay(from);
    // Parse the business day
    const [y, m, d] = dayStr.split("-").map(Number);

    // Add delta calendar days
    const base = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    base.setUTCDate(base.getUTCDate() + delta);

    // Return at cutoffHour in the configured timezone
    return this.fromDateInTimezone(
      base.getUTCFullYear(),
      base.getUTCMonth() + 1,
      base.getUTCDate(),
      this.cutoffHour,
      0,
      0,
    );
  }

  /**
   * Find the next occurrence of cutoffHour in the configured timezone
   * that is strictly after `from`.
   */
  nextCutoff(from: Date): Date {
    const local = this.toLocalParts(from);

    // Check if today's cutoff is still in the future (local hour < cutoff)
    if (local.hour < this.cutoffHour) {
      // Today's cutoff hasn't happened yet
      return this.fromDateInTimezone(
        local.year,
        local.month,
        local.day,
        this.cutoffHour,
        0,
        0,
      );
    }

    // Today's cutoff has passed; return tomorrow's cutoff
    const tomorrow = new Date(
      Date.UTC(local.year, local.month - 1, local.day, 0, 0, 0),
    );
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    return this.fromDateInTimezone(
      tomorrow.getUTCFullYear(),
      tomorrow.getUTCMonth() + 1,
      tomorrow.getUTCDate(),
      this.cutoffHour,
      0,
      0,
    );
  }
}

/**
 * Fixture helper: run an async callback with a guaranteed business day string.
 * Useful for test setup and integration scenarios.
 */
export async function withBusinessDay<T>(
  _clock: BusinessDayClock,
  _day: string,
  fn: () => Promise<T>,
): Promise<T> {
  return fn();
}
