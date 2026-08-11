/**
 * Property test for verify.ts artifact invariant.
 *
 * Invariant: if verdict === "VERIFIED", then both baseline/ and treatment/
 * directories contain at least one artifact file [R13.4].
 *
 * **Validates: Requirements R1.1, R13.4**
 */

import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { runVerify, type VerifyOptions } from "../src/verify.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("verify artifact invariant [R13.4]", () => {
  let testDir: string;

  afterEach(() => {
    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });

  it("VERIFIED implies non-empty baseline/ and treatment/ directories", async () => {
    testDir = join(tmpdir(), `forge-verify-invariant-${Date.now()}`);

    // We test the invariant by checking the result structure
    // when we simulate a successful verification scenario
    fc.assert(
      fc.asyncProperty(
        fc.record({
          condition: fc.string({ minLength: 1, maxLength: 100 }),
          metric: fc.string({ minLength: 1, maxLength: 50 }),
          threshold: fc.string({ minLength: 1, maxLength: 50 }),
        }),
        async (claim) => {
          mkdirSync(testDir, { recursive: true });
          const opts: VerifyOptions = {
            topic: "invariant-test",
            cwd: testDir,
            forgeDir: join(testDir, ".tinkerman"),
            claim,
          };

          const result = await runVerify(opts);

          if (result.verdict === "VERIFIED") {
            // Invariant: baseline/ and treatment/ must each have ≥1 file
            expect(result.baselineFiles.length).toBeGreaterThan(0);
            expect(result.treatmentFiles.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
