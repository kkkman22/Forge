import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { detectCiCommandDrift } from "../src/ci-command-drift.js";
const VALID_KINDS = [
    "has_ci_command",
    "drift_with_npm_check",
    "no_check_no_field",
    "malformed_package_json",
];
describe("detectCiCommandDrift — properties", () => {
    // Property 1: Completeness — kind is always one of the four valid values
    it("always returns a valid kind for arbitrary inputs", () => {
        fc.assert(fc.property(fc.oneof(fc.constant(undefined), fc.string()), fc.oneof(fc.constant(null), fc.string()), (ciCmd, pkgRaw) => {
            const result = detectCiCommandDrift({ ci_check_command: ciCmd }, pkgRaw);
            expect(VALID_KINDS).toContain(result.kind);
        }));
    });
    // Property 2: Priority — non-empty ci_check_command always → has_ci_command
    it("returns has_ci_command for any non-blank ci_check_command", () => {
        fc.assert(fc.property(fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0), fc.oneof(fc.constant(null), fc.string()), (nonBlankCmd, pkgRaw) => {
            const result = detectCiCommandDrift({ ci_check_command: nonBlankCmd }, pkgRaw);
            expect(result.kind).toBe("has_ci_command");
            if (result.kind === "has_ci_command") {
                expect(result.command).toBe(nonBlankCmd);
            }
        }));
    });
    // Property 3: No throw — never throws for any input
    it("never throws for any combination of inputs", () => {
        fc.assert(fc.property(fc.oneof(fc.constant(undefined), fc.string()), fc.oneof(fc.constant(null), fc.string()), (ciCmd, pkgRaw) => {
            expect(() => detectCiCommandDrift({ ci_check_command: ciCmd }, pkgRaw)).not.toThrow();
        }));
    });
});
//# sourceMappingURL=ci-command-drift.property.test.js.map