/**
 * Property-based tests for the generic file reader used by skill-aware iteration.
 *
 * **Property 4: Generic file reader — null safety**
 * **Validates: Requirements 4.1, 4.5, 4.6**
 *
 * For any reader callback configuration:
 * - If reader is `undefined`, result is `null`
 * - If reader throws any `Error`, result is `null`
 * - If reader returns a string, result equals that string
 *
 * Tests the `readFileContent` function exported from `sdk-skill-iteration.ts`.
 * Previously this tested a private method on SdkDriver; after the
 * sdk-driver-decomposition extraction, the function lives in the
 * skill-aware iteration module.
 */
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readFileContent } from "../src/sdk-skill-iteration.js";

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Property 4: Generic file reader — null safety
// ---------------------------------------------------------------------------

describe("Property 4: Generic file reader — null safety", () => {
  /**
   * **Validates: Requirements 4.1, 4.5, 4.6**
   *
   * For any reader callback:
   * - undefined → null
   * - throws → null
   * - returns string → that string
   */
  it("returns null when reader is undefined", () => {
    fc.assert(
      fc.property(fc.constant(undefined), (_reader) => {
        const result = readFileContent(undefined);
        expect(result).toBeNull();
      }),
    );
  });

  it("returns null when reader throws any Error", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 200 }), (errorMessage) => {
        const throwingReader = (): string => {
          throw new Error(errorMessage);
        };

        const result = readFileContent(throwingReader);
        expect(result).toBeNull();
      }),
    );
  });

  it("returns null when reader throws a non-Error value", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
        ),
        (thrownValue) => {
          const throwingReader = (): string => {
            throw thrownValue;
          };

          const result = readFileContent(throwingReader);
          expect(result).toBeNull();
        },
      ),
    );
  });

  it("returns the string when reader returns a string", () => {
    fc.assert(
      fc.property(fc.string(), (content) => {
        const stringReader = (): string => content;

        const result = readFileContent(stringReader);
        expect(result).toBe(content);
      }),
    );
  });

  it("unified property: undefined → null, throws → null, returns string → that string", () => {
    // Arbitrary that produces one of three reader scenarios
    const readerArb: fc.Arbitrary<{
      reader: (() => string) | undefined;
      expected: string | null;
    }> = fc.oneof(
      // Case 1: undefined reader → null
      fc.constant({
        reader: undefined as (() => string) | undefined,
        expected: null as string | null,
      }),
      // Case 2: throwing reader → null
      fc.string({ minLength: 0, maxLength: 200 }).map((msg) => ({
        reader: (() => {
          throw new Error(msg);
        }) as () => string,
        expected: null as string | null,
      })),
      // Case 3: string-returning reader → that string
      fc.string().map((content) => ({
        reader: (() => content) as () => string,
        expected: content,
      })),
    );

    fc.assert(
      fc.property(readerArb, ({ reader, expected }) => {
        const result = readFileContent(reader);
        expect(result).toBe(expected);
      }),
    );
  });
});
