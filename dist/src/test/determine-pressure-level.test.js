/**
 * Unit tests for determinePressureLevel() pure function.
 *
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8
 */
import { describe, expect, it } from "vitest";
import { determinePressureLevel } from "../src/pua-engine.js";
describe("determinePressureLevel", () => {
    describe("basic mapping (stallDetected = false)", () => {
        it("returns L0 for 0 failures", () => {
            expect(determinePressureLevel(0, false)).toBe("L0");
        });
        it("returns L0 for 1 failure", () => {
            expect(determinePressureLevel(1, false)).toBe("L0");
        });
        it("returns L1 for 2 failures", () => {
            expect(determinePressureLevel(2, false)).toBe("L1");
        });
        it("returns L2 for 3 failures", () => {
            expect(determinePressureLevel(3, false)).toBe("L2");
        });
        it("returns L3 for 4 failures", () => {
            expect(determinePressureLevel(4, false)).toBe("L3");
        });
        it("returns L4 for 5 failures", () => {
            expect(determinePressureLevel(5, false)).toBe("L4");
        });
        it("returns L4 for large failure counts", () => {
            expect(determinePressureLevel(10, false)).toBe("L4");
            expect(determinePressureLevel(100, false)).toBe("L4");
        });
    });
    describe("stall detection promotion (stallDetected = true)", () => {
        it("promotes L0 to L1 when stall detected with 0 failures", () => {
            expect(determinePressureLevel(0, true)).toBe("L1");
        });
        it("promotes L0 to L1 when stall detected with 1 failure", () => {
            expect(determinePressureLevel(1, true)).toBe("L1");
        });
        it("promotes L1 to L2 when stall detected with 2 failures", () => {
            expect(determinePressureLevel(2, true)).toBe("L2");
        });
        it("promotes L2 to L3 when stall detected with 3 failures", () => {
            expect(determinePressureLevel(3, true)).toBe("L3");
        });
        it("promotes L3 to L4 when stall detected with 4 failures", () => {
            expect(determinePressureLevel(4, true)).toBe("L4");
        });
        it("caps at L4 when stall detected with 5+ failures", () => {
            expect(determinePressureLevel(5, true)).toBe("L4");
            expect(determinePressureLevel(10, true)).toBe("L4");
        });
    });
    describe("defensive handling of negative input", () => {
        it("returns L0 for negative failures without stall", () => {
            expect(determinePressureLevel(-1, false)).toBe("L0");
            expect(determinePressureLevel(-100, false)).toBe("L0");
        });
        it("returns L1 for negative failures with stall detected", () => {
            expect(determinePressureLevel(-1, true)).toBe("L1");
            expect(determinePressureLevel(-50, true)).toBe("L1");
        });
    });
});
//# sourceMappingURL=determine-pressure-level.test.js.map