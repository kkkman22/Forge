/**
 * Property-based tests for the incremental-verifier module.
 *
 * Covers:
 *   - Property 20: Verification strategy threshold
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  determineVerificationStrategy,
  INCREMENTAL_THRESHOLD,
} from "../src/incremental-verifier.js";

describe("Feature: forge-review-fix-optimization, Property 20: Verification strategy threshold", () => {
  it("<50 lines → incremental, >=50 lines → targeted-review", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10000 }), (linesChanged) => {
        const result = determineVerificationStrategy(linesChanged);
        expect(result.linesChanged).toBe(linesChanged);
        expect(result.threshold).toBe(INCREMENTAL_THRESHOLD);

        if (linesChanged < INCREMENTAL_THRESHOLD) {
          expect(result.strategy).toBe("incremental");
        } else {
          expect(result.strategy).toBe("targeted-review");
        }
      }),
    );
  });
});
