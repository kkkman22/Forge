import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { __resetForTest, cmuxAvailable, isStickyUnavailable, markUnavailable, } from "../../scripts/cmux-mirror/lib/availability.mjs";
beforeEach(() => __resetForTest());
afterEach(() => __resetForTest());
describe("sticky-unavailable integration (R13.1, R13.9, R1.7)", () => {
    it("first EPIPE causes cmuxAvailable() to permanently return false", () => {
        const orig = { ...process.env };
        process.env.CMUX_WORKSPACE_ID = "workspace:1";
        try {
            expect(cmuxAvailable()).toBe(true);
            markUnavailable("EPIPE");
            expect(cmuxAvailable()).toBe(false);
            expect(cmuxAvailable()).toBe(false);
            expect(isStickyUnavailable()).toBe(true);
        }
        finally {
            process.env = orig;
        }
    });
    it("CMUX_INTEGRATION=off short-circuits without detection I/O (R1.7)", () => {
        const orig = { ...process.env };
        process.env.CMUX_INTEGRATION = "off";
        process.env.CMUX_WORKSPACE_ID = "workspace:1";
        try {
            expect(cmuxAvailable()).toBe(false);
        }
        finally {
            process.env = orig;
        }
    });
    it("reset restores availability", () => {
        const orig = { ...process.env };
        process.env.CMUX_WORKSPACE_ID = "workspace:1";
        try {
            markUnavailable("test");
            expect(cmuxAvailable()).toBe(false);
            __resetForTest();
            expect(cmuxAvailable()).toBe(true);
        }
        finally {
            process.env = orig;
        }
    });
});
//# sourceMappingURL=sticky-unavailable.test.js.map