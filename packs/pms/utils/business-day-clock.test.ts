import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  BusinessDayClock,
  type BusinessDayClockConfig,
  withBusinessDay,
} from "./business-day-clock.js";

// Helper: create a UTC Date from components
function utcDate(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute = 0,
  second = 0,
): Date {
  return new Date(
    Date.UTC(year, month - 1, day, hour, minute, second),
  );
}

// ---------------------------------------------------------------------------
// 1. getBusinessDay — before/after cutoff
// ---------------------------------------------------------------------------
describe("BusinessDayClock.getBusinessDay", () => {
  const config: BusinessDayClockConfig = {
    cutoffHour: 6,
    timezone: "Asia/Shanghai", // UTC+8 (no DST)
  };

  it("returns same calendar day when local hour >= cutoff", () => {
    // 2025-01-15 07:00 Shanghai = 2025-01-14 23:00 UTC
    const clock = new BusinessDayClock(config);
    const instant = utcDate(2025, 1, 14, 23, 0); // Shanghai 07:00
    expect(clock.getBusinessDay(instant)).toBe("2025-01-15");
  });

  it("returns previous calendar day when local hour < cutoff", () => {
    const clock = new BusinessDayClock(config);
    // 2025-01-15 05:00 Shanghai = 2025-01-14 21:00 UTC
    const instant = utcDate(2025, 1, 14, 21, 0); // Shanghai 05:00
    expect(clock.getBusinessDay(instant)).toBe("2025-01-14");
  });

  it("returns previous day at exactly cutoff boundary (hour < cutoff)", () => {
    const clock = new BusinessDayClock(config);
    // 2025-01-15 05:59 Shanghai = 2025-01-14 21:59 UTC
    const instant = utcDate(2025, 1, 14, 21, 59);
    expect(clock.getBusinessDay(instant)).toBe("2025-01-14");
  });

  it("returns same day at exactly cutoff hour", () => {
    const clock = new BusinessDayClock(config);
    // 2025-01-15 06:00 Shanghai = 2025-01-14 22:00 UTC
    const instant = utcDate(2025, 1, 14, 22, 0);
    expect(clock.getBusinessDay(instant)).toBe("2025-01-15");
  });

  it("handles cutoffHour=0 (business day always = calendar day)", () => {
    const clock = new BusinessDayClock({
      cutoffHour: 0,
      timezone: "UTC",
    });
    const instant = utcDate(2025, 3, 10, 0, 0);
    expect(clock.getBusinessDay(instant)).toBe("2025-03-10");
  });

  it("handles cutoffHour=23 (almost whole day counts as previous)", () => {
    const clock = new BusinessDayClock({
      cutoffHour: 23,
      timezone: "UTC",
    });
    // 22:59 UTC -> business day = previous calendar day
    const instant = utcDate(2025, 3, 10, 22, 59);
    expect(clock.getBusinessDay(instant)).toBe("2025-03-09");
  });
});

// ---------------------------------------------------------------------------
// 2. isSameBusinessDay
// ---------------------------------------------------------------------------
describe("BusinessDayClock.isSameBusinessDay", () => {
  const config: BusinessDayClockConfig = {
    cutoffHour: 6,
    timezone: "Asia/Shanghai",
  };

  it("returns true for two instants on the same business day", () => {
    const clock = new BusinessDayClock(config);
    // Both after cutoff on Jan 15 Shanghai
    const a = utcDate(2025, 1, 14, 22, 0); // Shanghai 06:00 Jan 15
    const b = utcDate(2025, 1, 15, 10, 0); // Shanghai 18:00 Jan 15
    expect(clock.isSameBusinessDay(a, b)).toBe(true);
  });

  it("returns false for instants on different business days", () => {
    const clock = new BusinessDayClock(config);
    const a = utcDate(2025, 1, 14, 21, 59); // Shanghai 05:59 -> business day Jan 14
    const b = utcDate(2025, 1, 14, 22, 0); // Shanghai 06:00 -> business day Jan 15
    expect(clock.isSameBusinessDay(a, b)).toBe(false);
  });

  it("returns true for identical instants", () => {
    const clock = new BusinessDayClock(config);
    const a = utcDate(2025, 6, 1, 12, 0);
    expect(clock.isSameBusinessDay(a, a)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. nextCutoff
// ---------------------------------------------------------------------------
describe("BusinessDayClock.nextCutoff", () => {
  const config: BusinessDayClockConfig = {
    cutoffHour: 6,
    timezone: "Asia/Shanghai", // UTC+8
  };

  it("returns today's cutoff when `from` is before cutoff", () => {
    const clock = new BusinessDayClock(config);
    // 2025-01-15 03:00 Shanghai = 2025-01-14 19:00 UTC
    const from = utcDate(2025, 1, 14, 19, 0);
    const cutoff = clock.nextCutoff(from);
    // Should be 2025-01-15 06:00 Shanghai = 2025-01-14 22:00 UTC
    expect(cutoff.getTime()).toBe(utcDate(2025, 1, 14, 22, 0).getTime());
  });

  it("returns tomorrow's cutoff when `from` is exactly at cutoff", () => {
    const clock = new BusinessDayClock(config);
    // 2025-01-15 06:00 Shanghai = 2025-01-14 22:00 UTC
    const from = utcDate(2025, 1, 14, 22, 0);
    const cutoff = clock.nextCutoff(from);
    // Should be 2025-01-16 06:00 Shanghai = 2025-01-15 22:00 UTC
    expect(cutoff.getTime()).toBe(utcDate(2025, 1, 15, 22, 0).getTime());
  });

  it("returns tomorrow's cutoff when `from` is after cutoff", () => {
    const clock = new BusinessDayClock(config);
    // 2025-01-15 20:00 Shanghai = 2025-01-15 12:00 UTC
    const from = utcDate(2025, 1, 15, 12, 0);
    const cutoff = clock.nextCutoff(from);
    // Should be 2025-01-16 06:00 Shanghai = 2025-01-15 22:00 UTC
    expect(cutoff.getTime()).toBe(utcDate(2025, 1, 15, 22, 0).getTime());
  });
});

// ---------------------------------------------------------------------------
// 4. addBusinessDays
// ---------------------------------------------------------------------------
describe("BusinessDayClock.addBusinessDays", () => {
  const config: BusinessDayClockConfig = {
    cutoffHour: 6,
    timezone: "Asia/Shanghai",
  };

  it("returns same business day at cutoffHour when delta=0", () => {
    const clock = new BusinessDayClock(config);
    // 2025-01-15 10:00 Shanghai -> business day 2025-01-15
    const from = utcDate(2025, 1, 15, 2, 0);
    const result = clock.addBusinessDays(from, 0);
    // Result should be 2025-01-15 06:00 Shanghai = 2025-01-14 22:00 UTC
    expect(result.getTime()).toBe(utcDate(2025, 1, 14, 22, 0).getTime());
  });

  it("adds positive delta correctly", () => {
    const clock = new BusinessDayClock(config);
    const from = utcDate(2025, 1, 14, 22, 0); // Shanghai Jan 15 06:00
    const result = clock.addBusinessDays(from, 3);
    // Business day 2025-01-15 + 3 = 2025-01-18
    // Result: 2025-01-18 06:00 Shanghai = 2025-01-17 22:00 UTC
    expect(result.getTime()).toBe(utcDate(2025, 1, 17, 22, 0).getTime());
  });

  it("adds negative delta correctly", () => {
    const clock = new BusinessDayClock(config);
    const from = utcDate(2025, 1, 14, 22, 0); // Business day 2025-01-15
    const result = clock.addBusinessDays(from, -2);
    // Business day 2025-01-15 - 2 = 2025-01-13
    // Result: 2025-01-13 06:00 Shanghai = 2025-01-12 22:00 UTC
    expect(result.getTime()).toBe(utcDate(2025, 1, 12, 22, 0).getTime());
  });

  it("crosses month boundary correctly", () => {
    const clock = new BusinessDayClock(config);
    const from = utcDate(2025, 1, 30, 22, 0); // Business day 2025-01-31
    const result = clock.addBusinessDays(from, 1);
    // 2025-01-31 + 1 = 2025-02-01
    // 2025-02-01 06:00 Shanghai = 2025-01-31 22:00 UTC
    expect(result.getTime()).toBe(utcDate(2025, 1, 31, 22, 0).getTime());
  });
});

// ---------------------------------------------------------------------------
// 5. DST transition tests
// ---------------------------------------------------------------------------
describe("BusinessDayClock DST transitions", () => {
  // America/New_York: EST UTC-5 (winter), EDT UTC-4 (summer)
  // Spring forward: 2025-03-09 02:00 local -> 03:00 local (clocks jump forward)
  // Fall back: 2025-11-02 02:00 local -> 01:00 local (clocks fall back)

  describe("America/New_York", () => {
    const config: BusinessDayClockConfig = {
      cutoffHour: 6,
      timezone: "America/New_York",
    };

    it("handles spring-forward correctly (getBusinessDay)", () => {
      const clock = new BusinessDayClock(config);
      // 2025-03-09 03:00 EDT (= 07:00 UTC) — right after spring forward
      const instant = utcDate(2025, 3, 9, 7, 0);
      // 07:00 UTC = 03:00 EDT, hour 3 < cutoff 6 -> business day 2025-03-08
      expect(clock.getBusinessDay(instant)).toBe("2025-03-08");
    });

    it("handles fall-back correctly (getBusinessDay)", () => {
      const clock = new BusinessDayClock(config);
      // 2025-11-02 01:30 EST (= 06:30 UTC) — first occurrence during fall back
      const instant = utcDate(2025, 11, 2, 6, 30);
      // 06:30 UTC = 01:30 EST, hour 1 < cutoff 6 -> business day 2025-11-01
      expect(clock.getBusinessDay(instant)).toBe("2025-11-01");
    });

    it("nextCutoff works across spring-forward", () => {
      const clock = new BusinessDayClock(config);
      // 2025-03-08 22:00 EST (= 2025-03-09 03:00 UTC) — after cutoff, near DST
      const from = utcDate(2025, 3, 9, 3, 0);
      const cutoff = clock.nextCutoff(from);
      // Next cutoff should be 2025-03-09 06:00 EDT
      // EDT = UTC-4, so 06:00 EDT = 10:00 UTC
      expect(cutoff.getTime()).toBe(utcDate(2025, 3, 9, 10, 0).getTime());
    });

    it("addBusinessDays works across DST change", () => {
      const clock = new BusinessDayClock(config);
      // 2025-03-08 10:00 EST = 15:00 UTC (after cutoff, business day Mar 8)
      const from = utcDate(2025, 3, 8, 15, 0);
      const result = clock.addBusinessDays(from, 2);
      // Business day 2025-03-08 + 2 = 2025-03-10
      // 2025-03-10 06:00 EDT = 10:00 UTC
      expect(result.getTime()).toBe(utcDate(2025, 3, 10, 10, 0).getTime());
    });
  });

  describe("Europe/London", () => {
    // Europe/London: GMT UTC+0 (winter), BST UTC+1 (summer)
    // Spring forward: 2025-03-30 01:00 GMT -> 02:00 BST
    // Fall back: 2025-10-26 02:00 BST -> 01:00 GMT

    const config: BusinessDayClockConfig = {
      cutoffHour: 6,
      timezone: "Europe/London",
    };

    it("handles spring-forward (BST start) correctly", () => {
      const clock = new BusinessDayClock(config);
      // 2025-03-30 01:00 GMT = 01:00 UTC — this is exactly the DST transition moment
      // After transition, clocks show 02:00 BST
      // 2025-03-30 08:00 BST = 07:00 UTC
      const instant = utcDate(2025, 3, 30, 7, 0);
      // 07:00 UTC = 08:00 BST, hour 8 >= cutoff 6 -> business day 2025-03-30
      expect(clock.getBusinessDay(instant)).toBe("2025-03-30");
    });

    it("handles pre-DST transition correctly", () => {
      const clock = new BusinessDayClock(config);
      // 2025-03-30 00:30 GMT = 00:30 UTC (before spring forward)
      const instant = utcDate(2025, 3, 30, 0, 30);
      // 00:30 UTC = 00:30 GMT (or 01:30 BST depending on interpretation)
      // Actually at 00:30 UTC on Mar 30, London is still GMT (BST starts at 01:00 UTC)
      // So local time = 00:30 GMT, hour 0 < cutoff 6 -> business day 2025-03-29
      expect(clock.getBusinessDay(instant)).toBe("2025-03-29");
    });

    it("handles fall-back (GMT return) correctly", () => {
      const clock = new BusinessDayClock(config);
      // 2025-10-26 01:30 GMT (= 01:30 UTC) — after fall back
      const instant = utcDate(2025, 10, 26, 1, 30);
      // 01:30 UTC = 01:30 GMT, hour 1 < cutoff 6 -> business day 2025-10-25
      expect(clock.getBusinessDay(instant)).toBe("2025-10-25");
    });
  });

  describe("Asia/Shanghai (no DST)", () => {
    const config: BusinessDayClockConfig = {
      cutoffHour: 6,
      timezone: "Asia/Shanghai",
    };

    it("getBusinessDay is consistent year-round", () => {
      const clock = new BusinessDayClock(config);
      // Shanghai = UTC+8 year-round (no DST)
      // For business day Jan 15 at cutoffHour=6:
      //   Shanghai 06:00 = UTC 22:00 previous day
      const winter = utcDate(2025, 1, 14, 22, 0); // Shanghai Jan 15 06:00
      const summer = utcDate(2025, 7, 14, 22, 0); // Shanghai Jul 15 06:00
      expect(clock.getBusinessDay(winter)).toBe("2025-01-15");
      expect(clock.getBusinessDay(summer)).toBe("2025-07-15");
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Property tests (fast-check)
// ---------------------------------------------------------------------------
describe("BusinessDayClock property tests", () => {
  const config: BusinessDayClockConfig = {
    cutoffHour: 6,
    timezone: "America/New_York",
  };

  const validDate = () =>
    fc.date({
      min: new Date("2000-01-01"),
      max: new Date("2030-12-31"),
      noInvalidDate: true,
    });

  it("isSameBusinessDay is reflexive", () => {
    const clock = new BusinessDayClock(config);
    fc.assert(
      fc.property(validDate(), (d) => {
        expect(clock.isSameBusinessDay(d, d)).toBe(true);
      }),
    );
  });

  it("isSameBusinessDay is symmetric", () => {
    const clock = new BusinessDayClock(config);
    fc.assert(
      fc.property(validDate(), validDate(), (a, b) => {
        expect(clock.isSameBusinessDay(a, b)).toBe(clock.isSameBusinessDay(b, a));
      }),
    );
  });

  it("cutoff crossing: instants just before and after cutoff are different business days", () => {
    // For any date, the instant 1 minute before cutoff and at cutoff should be different days
    const clock = new BusinessDayClock({ cutoffHour: 6, timezone: "UTC" });
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2029 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 2, max: 28 }), // avoid month-edge issues
        (year, month, day) => {
          const beforeCutoff = new Date(Date.UTC(year, month - 1, day, 5, 59, 0));
          const atCutoff = new Date(Date.UTC(year, month - 1, day, 6, 0, 0));
          expect(clock.isSameBusinessDay(beforeCutoff, atCutoff)).toBe(false);
        },
      ),
    );
  });

  it("addBusinessDays roundtrip: add(N) then add(-N) returns same business day", () => {
    const clock = new BusinessDayClock(config);
    fc.assert(
      fc.property(
        validDate(),
        fc.integer({ min: -30, max: 30 }),
        (from, delta) => {
          const forward = clock.addBusinessDays(from, delta);
          const back = clock.addBusinessDays(forward, -delta);
          expect(clock.getBusinessDay(back)).toBe(clock.getBusinessDay(from));
        },
      ),
    );
  });

  it("addBusinessDays(N) then addBusinessDays(M) === addBusinessDays(N+M)", () => {
    const clock = new BusinessDayClock(config);
    fc.assert(
      fc.property(
        validDate(),
        fc.integer({ min: -15, max: 15 }),
        fc.integer({ min: -15, max: 15 }),
        (from, n, m) => {
          const stepByStep = clock.addBusinessDays(clock.addBusinessDays(from, n), m);
          const direct = clock.addBusinessDays(from, n + m);
          expect(clock.getBusinessDay(stepByStep)).toBe(clock.getBusinessDay(direct));
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// 7. withBusinessDay fixture helper test
// ---------------------------------------------------------------------------
describe("withBusinessDay", () => {
  it("passes the resolved business day string to the callback and returns its result", async () => {
    const clock = new BusinessDayClock({
      cutoffHour: 6,
      timezone: "UTC",
    });
    const instant = new Date(Date.UTC(2025, 5, 15, 10, 0)); // 10:00 UTC, business day 2025-06-15

    let capturedDay: string | undefined;
    const result = await withBusinessDay(clock, clock.getBusinessDay(instant), async () => {
      capturedDay = "2025-06-15";
      return 42;
    });

    expect(result).toBe(42);
    expect(capturedDay).toBe("2025-06-15");
  });

  it("propagates errors from the callback", async () => {
    const clock = new BusinessDayClock({
      cutoffHour: 6,
      timezone: "UTC",
    });

    await expect(
      withBusinessDay(clock, "2025-01-01", async () => {
        throw new Error("test error");
      }),
    ).rejects.toThrow("test error");
  });

  it("works as a fixture wrapper — callback runs in correct business day context", async () => {
    const clock = new BusinessDayClock({
      cutoffHour: 6,
      timezone: "Asia/Shanghai", // UTC+8
    });

    // 2025-03-10 03:00 Shanghai = 2025-03-09 19:00 UTC
    // Local hour 3 < cutoff 6 -> business day 2025-03-09
    const instant = utcDate(2025, 3, 9, 19, 0);
    const day = clock.getBusinessDay(instant);

    const result = await withBusinessDay(clock, day, async () => {
      return { businessDay: day, label: `processing day ${day}` };
    });

    expect(result).toEqual({
      businessDay: "2025-03-09",
      label: "processing day 2025-03-09",
    });
  });
});
