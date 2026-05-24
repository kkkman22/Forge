import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { detectTierAvailability } from "../src/frontend-check.js";
const VALID_B_VALUES = ["preferred", "degraded", "unavailable"];
const VALID_C_VALUES = ["available", "unavailable"];
function envArb() {
    return fc.record({
        socketExists: fc.boolean(),
        workspaceIdSet: fc.boolean(),
        cmuxBinaryExists: fc.boolean(),
        mcpDevtoolsResponsive: fc.boolean(),
    });
}
describe("detectTierAvailability — property", () => {
    it("never throws for any env", () => {
        fc.assert(fc.property(envArb(), (env) => {
            expect(() => detectTierAvailability(env)).not.toThrow();
        }));
    });
    it("Tier A is always available", () => {
        fc.assert(fc.property(envArb(), (env) => {
            const result = detectTierAvailability(env);
            expect(result.a).toBe(true);
        }));
    });
    it("Tier B is preferred only when socket + workspace + binary all true", () => {
        fc.assert(fc.property(envArb(), (env) => {
            const result = detectTierAvailability(env);
            if (env.socketExists && env.workspaceIdSet && env.cmuxBinaryExists) {
                expect(result.b).toBe("preferred");
            }
        }));
    });
    it("Tier B is unavailable when cmuxBinaryExists is false", () => {
        fc.assert(fc.property(envArb(), (env) => {
            fc.pre(!env.cmuxBinaryExists);
            const result = detectTierAvailability(env);
            expect(result.b).toBe("unavailable");
        }));
    });
    it("Tier C is available only when mcpDevtoolsResponsive is true", () => {
        fc.assert(fc.property(envArb(), (env) => {
            const result = detectTierAvailability(env);
            if (env.mcpDevtoolsResponsive) {
                expect(result.c).toBe("available");
            }
            else {
                expect(result.c).toBe("unavailable");
            }
        }));
    });
    it("returns valid enum values for b and c", () => {
        fc.assert(fc.property(envArb(), (env) => {
            const result = detectTierAvailability(env);
            expect(VALID_B_VALUES).toContain(result.b);
            expect(VALID_C_VALUES).toContain(result.c);
        }));
    });
    it("reasons reflect env exactly", () => {
        fc.assert(fc.property(envArb(), (env) => {
            const result = detectTierAvailability(env);
            expect(result.reasons.cmuxSocket).toBe(env.socketExists);
            expect(result.reasons.cmuxWorkspaceEnv).toBe(env.workspaceIdSet);
            expect(result.reasons.cmuxBinary).toBe(env.cmuxBinaryExists);
            expect(result.reasons.mcpDevtools).toBe(env.mcpDevtoolsResponsive);
        }));
    });
});
describe("detectTierAvailability — unit", () => {
    it("all available → preferred B + available C", () => {
        const result = detectTierAvailability({
            socketExists: true,
            workspaceIdSet: true,
            cmuxBinaryExists: true,
            mcpDevtoolsResponsive: true,
        });
        expect(result).toEqual({
            a: true,
            b: "preferred",
            c: "available",
            reasons: {
                cmuxSocket: true,
                cmuxWorkspaceEnv: true,
                cmuxBinary: true,
                mcpDevtools: true,
            },
        });
    });
    it("no cmux binary → B unavailable, C independent", () => {
        const result = detectTierAvailability({
            socketExists: false,
            workspaceIdSet: false,
            cmuxBinaryExists: false,
            mcpDevtoolsResponsive: true,
        });
        expect(result.b).toBe("unavailable");
        expect(result.c).toBe("available");
    });
    it("cmux binary but no socket → degraded B", () => {
        const result = detectTierAvailability({
            socketExists: false,
            workspaceIdSet: true,
            cmuxBinaryExists: true,
            mcpDevtoolsResponsive: false,
        });
        expect(result.b).toBe("degraded");
        expect(result.c).toBe("unavailable");
    });
});
//# sourceMappingURL=frontend-check.property.test.js.map