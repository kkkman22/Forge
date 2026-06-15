import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetForTest,
  cmuxAvailable,
  isStickyUnavailable,
  markUnavailable,
} from "../../scripts/cmux-mirror/lib/availability.mjs";

beforeEach(() => __resetForTest());
afterEach(() => __resetForTest());

describe("availability: idempotence property (R12.1)", () => {
  it("returns the same value on two consecutive calls with fixed env/fs state", () => {
    fc.assert(
      fc.property(
        fc.record({
          CMUX_WORKSPACE_ID: fc.oneof(fc.constant(undefined), fc.string()),
          CMUX_SOCKET_PATH: fc.oneof(fc.constant(undefined), fc.string({ minLength: 0 })),
          CMUX_INTEGRATION: fc.oneof(
            fc.constant(undefined),
            fc.constant("off"),
            fc.constant("auto"),
            fc.constant("on"),
          ),
        }),
        (env) => {
          __resetForTest();
          const orig = { ...process.env };
          Object.assign(process.env, env);
          try {
            const first = cmuxAvailable();
            const second = cmuxAvailable();
            expect(second).toBe(first);
          } finally {
            process.env = orig;
          }
        },
      ),
    );
  });
});

describe("availability: exception safety (R1.2)", () => {
  it("returns false without throwing for any env combination", () => {
    fc.assert(
      fc.property(
        fc.record({
          CMUX_WORKSPACE_ID: fc.oneof(fc.constant(undefined), fc.string()),
          CMUX_SOCKET_PATH: fc.oneof(fc.constant(undefined), fc.string()),
        }),
        (env) => {
          __resetForTest();
          const orig = { ...process.env };
          Object.assign(process.env, env);
          try {
            expect(() => cmuxAvailable()).not.toThrow();
          } finally {
            process.env = orig;
          }
        },
      ),
    );
  });
});

describe("availability: CMUX_INTEGRATION=off short-circuit (R1.7)", () => {
  it("returns false when CMUX_INTEGRATION is off, regardless of other env", () => {
    const orig = { ...process.env };
    process.env.CMUX_INTEGRATION = "off";
    process.env.CMUX_WORKSPACE_ID = "workspace:1";
    try {
      expect(cmuxAvailable()).toBe(false);
    } finally {
      process.env = orig;
    }
  });
});

describe("availability: CMUX_WORKSPACE_ID detection (R1.1)", () => {
  it("returns true when CMUX_WORKSPACE_ID is non-empty", () => {
    __resetForTest();
    const orig = { ...process.env };
    process.env.CMUX_WORKSPACE_ID = "workspace:1";
    delete process.env.CMUX_SOCKET_PATH;
    try {
      expect(cmuxAvailable()).toBe(true);
    } finally {
      process.env = orig;
    }
  });

  it("returns false when CMUX_WORKSPACE_ID is empty string", () => {
    __resetForTest();
    const orig = { ...process.env };
    process.env.CMUX_WORKSPACE_ID = "";
    process.env.CMUX_INTEGRATION = "auto";
    delete process.env.CMUX_SOCKET_PATH;
    try {
      expect(cmuxAvailable()).toBe(false);
    } finally {
      process.env = orig;
    }
  });
});

describe("availability: sticky degradation (R13.1, R13.9)", () => {
  it("returns false permanently after markUnavailable is called", () => {
    __resetForTest();
    const orig = { ...process.env };
    process.env.CMUX_WORKSPACE_ID = "workspace:1";
    try {
      expect(cmuxAvailable()).toBe(true);
      markUnavailable("EPIPE");
      expect(isStickyUnavailable()).toBe(true);
      expect(cmuxAvailable()).toBe(false);
      // Repeated calls still false
      expect(cmuxAvailable()).toBe(false);
    } finally {
      process.env = orig;
    }
  });
});
