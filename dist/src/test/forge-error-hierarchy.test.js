/**
 * Unit tests for the unified ForgeError hierarchy.
 *
 * Verifies that each concrete error class (CliError, FrozenZoneViolation,
 * UnexpectedEffectError) correctly extends ForgeError and Error, and that
 * their `code` and `name` properties are set as expected.
 *
 * **Validates: Requirements 9.3, 9.4, 9.6**
 */
import { describe, expect, it } from "vitest";
import { CliError } from "../src/cli-error.js";
import { FrozenZoneViolation, UnexpectedEffectError } from "../src/effect-executor.js";
import { ForgeError } from "../src/forge-error.js";
// ---------------------------------------------------------------------------
// CliError hierarchy (Requirement 9.3)
// ---------------------------------------------------------------------------
describe("CliError extends ForgeError", () => {
    it("is instanceof ForgeError", () => {
        const err = new CliError("test");
        expect(err).toBeInstanceOf(ForgeError);
    });
    it("is instanceof Error", () => {
        const err = new CliError("test");
        expect(err).toBeInstanceOf(Error);
    });
    it('has code === "CLI_ERROR"', () => {
        const err = new CliError("test");
        expect(err.code).toBe("CLI_ERROR");
    });
    it('has name === "CliError"', () => {
        const err = new CliError("test");
        expect(err.name).toBe("CliError");
    });
    it("preserves the message", () => {
        const err = new CliError("something went wrong");
        expect(err.message).toBe("something went wrong");
    });
    it("preserves the exitCode", () => {
        const err = new CliError("fail", 42);
        expect(err.exitCode).toBe(42);
    });
});
// ---------------------------------------------------------------------------
// FrozenZoneViolation hierarchy (Requirement 9.4)
// ---------------------------------------------------------------------------
describe("FrozenZoneViolation extends ForgeError", () => {
    it("is instanceof ForgeError", () => {
        const err = new FrozenZoneViolation(["file.md"]);
        expect(err).toBeInstanceOf(ForgeError);
    });
    it("is instanceof Error", () => {
        const err = new FrozenZoneViolation(["file.md"]);
        expect(err).toBeInstanceOf(Error);
    });
    it('has code === "FROZEN_ZONE_VIOLATION"', () => {
        const err = new FrozenZoneViolation(["file.md"]);
        expect(err.code).toBe("FROZEN_ZONE_VIOLATION");
    });
    it('has name === "FrozenZoneViolation"', () => {
        const err = new FrozenZoneViolation(["file.md"]);
        expect(err.name).toBe("FrozenZoneViolation");
    });
    it("preserves the files array", () => {
        const files = ["a.md", "b.md"];
        const err = new FrozenZoneViolation(files);
        expect(err.files).toEqual(files);
    });
    it("includes file names in the message", () => {
        const err = new FrozenZoneViolation(["spec.md", "design.md"]);
        expect(err.message).toContain("spec.md");
        expect(err.message).toContain("design.md");
    });
});
// ---------------------------------------------------------------------------
// UnexpectedEffectError hierarchy (Requirement 9.4)
// ---------------------------------------------------------------------------
describe("UnexpectedEffectError extends ForgeError", () => {
    it("is instanceof ForgeError", () => {
        const err = new UnexpectedEffectError("boom");
        expect(err).toBeInstanceOf(ForgeError);
    });
    it("is instanceof Error", () => {
        const err = new UnexpectedEffectError("boom");
        expect(err).toBeInstanceOf(Error);
    });
    it('has code === "UNEXPECTED_EFFECT_ERROR"', () => {
        const err = new UnexpectedEffectError("boom");
        expect(err.code).toBe("UNEXPECTED_EFFECT_ERROR");
    });
    it('has name === "UnexpectedEffectError"', () => {
        const err = new UnexpectedEffectError("boom");
        expect(err.name).toBe("UnexpectedEffectError");
    });
    it("preserves the message", () => {
        const err = new UnexpectedEffectError("git command failed with exit code 128");
        expect(err.message).toBe("git command failed with exit code 128");
    });
});
// ---------------------------------------------------------------------------
// Cross-class discrimination (Requirement 9.6)
// ---------------------------------------------------------------------------
describe("ForgeError subclass discrimination", () => {
    it("CliError is not instanceof FrozenZoneViolation or UnexpectedEffectError", () => {
        const err = new CliError("test");
        expect(err).not.toBeInstanceOf(FrozenZoneViolation);
        expect(err).not.toBeInstanceOf(UnexpectedEffectError);
    });
    it("FrozenZoneViolation is not instanceof CliError or UnexpectedEffectError", () => {
        const err = new FrozenZoneViolation(["file.md"]);
        expect(err).not.toBeInstanceOf(CliError);
        expect(err).not.toBeInstanceOf(UnexpectedEffectError);
    });
    it("UnexpectedEffectError is not instanceof CliError or FrozenZoneViolation", () => {
        const err = new UnexpectedEffectError("boom");
        expect(err).not.toBeInstanceOf(CliError);
        expect(err).not.toBeInstanceOf(FrozenZoneViolation);
    });
    it("all three subclasses share ForgeError as common ancestor", () => {
        const cli = new CliError("a");
        const frozen = new FrozenZoneViolation(["b"]);
        const unexpected = new UnexpectedEffectError("c");
        for (const err of [cli, frozen, unexpected]) {
            expect(err).toBeInstanceOf(ForgeError);
            expect(err).toBeInstanceOf(Error);
        }
    });
    it("each subclass has a distinct error code", () => {
        const codes = new Set([
            new CliError("a").code,
            new FrozenZoneViolation(["b"]).code,
            new UnexpectedEffectError("c").code,
        ]);
        expect(codes.size).toBe(3);
    });
});
//# sourceMappingURL=forge-error-hierarchy.test.js.map