/**
 * Property-based tests for the ForgeError hierarchy (Property 1).
 *
 * Property 1: ForgeError hierarchy — instanceof chain
 *   - For any ForgeError subclass instance:
 *     - `instanceof ForgeError` is true
 *     - `instanceof Error` is true
 *     - `code` is a non-empty string
 *     - `name` equals the constructor name
 *     - `message` is a string
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ForgeError } from "../src/forge-error.js";
// ---------------------------------------------------------------------------
// Test subclasses — concrete implementations of ForgeError for property testing
// ---------------------------------------------------------------------------
/** A minimal concrete ForgeError subclass with a fixed code. */
class TestForgeError extends ForgeError {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}
/** A second concrete subclass to verify name reflects the actual constructor. */
class AnotherForgeError extends ForgeError {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Arbitrary non-empty string for error codes. */
const nonEmptyCodeArb = fc.string({ minLength: 1, maxLength: 50 });
/** Arbitrary string for error messages (can be empty). */
const messageArb = fc.string({ maxLength: 200 });
/**
 * Arbitrary ForgeError subclass instance.
 * Randomly picks between TestForgeError and AnotherForgeError to verify
 * the property holds across different subclasses.
 */
const forgeErrorArb = fc
    .tuple(fc.boolean(), messageArb, nonEmptyCodeArb)
    .map(([useFirst, message, code]) => useFirst ? new TestForgeError(message, code) : new AnotherForgeError(message, code));
// ---------------------------------------------------------------------------
// Property 1: ForgeError hierarchy — instanceof chain
// ---------------------------------------------------------------------------
describe("Property 1: ForgeError hierarchy — instanceof chain", () => {
    /**
     * **Validates: Requirements 9.1**
     */
    it("every ForgeError subclass instance is instanceof ForgeError", () => {
        fc.assert(fc.property(forgeErrorArb, (err) => {
            expect(err).toBeInstanceOf(ForgeError);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 9.1**
     */
    it("every ForgeError subclass instance is instanceof Error", () => {
        fc.assert(fc.property(forgeErrorArb, (err) => {
            expect(err).toBeInstanceOf(Error);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 9.2**
     */
    it("code is a non-empty string for any ForgeError subclass instance", () => {
        fc.assert(fc.property(forgeErrorArb, (err) => {
            expect(typeof err.code).toBe("string");
            expect(err.code.length).toBeGreaterThan(0);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 9.2**
     */
    it("name equals the constructor name for any ForgeError subclass instance", () => {
        fc.assert(fc.property(forgeErrorArb, (err) => {
            expect(err.name).toBe(err.constructor.name);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 9.1, 9.2**
     */
    it("message is a string for any ForgeError subclass instance", () => {
        fc.assert(fc.property(forgeErrorArb, (err) => {
            expect(typeof err.message).toBe("string");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 9.1, 9.2**
     *
     * Combined property: all five invariants hold simultaneously.
     */
    it("all hierarchy invariants hold simultaneously for any subclass instance", () => {
        fc.assert(fc.property(forgeErrorArb, (err) => {
            // instanceof chain
            expect(err).toBeInstanceOf(ForgeError);
            expect(err).toBeInstanceOf(Error);
            // code is non-empty string
            expect(typeof err.code).toBe("string");
            expect(err.code.length).toBeGreaterThan(0);
            // name matches constructor
            expect(err.name).toBe(err.constructor.name);
            // message is a string
            expect(typeof err.message).toBe("string");
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 9.2**
     *
     * Verify that distinct subclasses produce distinct names.
     */
    it("TestForgeError.name is 'TestForgeError' and AnotherForgeError.name is 'AnotherForgeError'", () => {
        fc.assert(fc.property(messageArb, nonEmptyCodeArb, (message, code) => {
            const a = new TestForgeError(message, code);
            const b = new AnotherForgeError(message, code);
            expect(a.name).toBe("TestForgeError");
            expect(b.name).toBe("AnotherForgeError");
            expect(a.name).not.toBe(b.name);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 9.1**
     *
     * Verify the message passed to the constructor is preserved.
     */
    it("message passed to constructor is preserved on the instance", () => {
        fc.assert(fc.property(messageArb, nonEmptyCodeArb, (message, code) => {
            const err = new TestForgeError(message, code);
            expect(err.message).toBe(message);
        }), { numRuns: 200 });
    });
});
//# sourceMappingURL=forge-error.property.test.js.map