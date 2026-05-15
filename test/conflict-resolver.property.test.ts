import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  parseConflictedPaths,
  classifyConflictZone,
  validateConflictResolution,
} from "../src/conflict-resolver.js";
import type { CheckAttempt } from "../src/conflict-resolver.js";

describe("PBT: parseConflictedPaths", () => {
  it("always returns valid strings from any input", () => {
    fc.assert(
      fc.property(fc.string(), (output) => {
        const paths = parseConflictedPaths(output);
        for (const p of paths) {
          expect(typeof p).toBe("string");
          expect(p.length).toBeGreaterThan(0);
        }
      }),
    );
  });
});

describe("PBT: classifyConflictZone totality", () => {
  const validZones = new Set(["frozen", "guarded", "open", "source"]);

  it("always returns a valid zone for any path", () => {
    fc.assert(
      fc.property(fc.string(), (path) => {
        const zone = classifyConflictZone(path, "");
        expect(validZones).toContain(zone);
      }),
    );
  });

  it("is deterministic: same input same output", () => {
    fc.assert(
      fc.property(fc.string(), (path) => {
        const a = classifyConflictZone(path, "");
        const b = classifyConflictZone(path, "");
        expect(a).toBe(b);
      }),
    );
  });
});

describe("PBT: validateConflictResolution invariants", () => {
  it("strike count is always between 0 and 3", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            timestamp: fc.integer({ min: 0, max: 1_000_000 }),
            filesSinceLastAttempt: fc.uniqueArray(fc.string(), { minLength: 0, maxLength: 5 }).map((a) => new Set(a)),
            exitCode: fc.integer({ min: 0, max: 2 }),
          }),
        ),
        (rawAttempts) => {
          const attempts: CheckAttempt[] = rawAttempts.map((a) => ({
            ...a,
            filesSinceLastAttempt: a.filesSinceLastAttempt instanceof Set
              ? a.filesSinceLastAttempt
              : new Set(Array.isArray(a.filesSinceLastAttempt) ? a.filesSinceLastAttempt : []),
          }));
          const gate = validateConflictResolution(attempts);
          expect(gate.attemptCount).toBeGreaterThanOrEqual(0);
          expect(gate.attemptCount).toBeLessThanOrEqual(3);
        },
      ),
    );
  });

  it("escalateToDebug implies passed is false", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            timestamp: fc.integer(),
            filesSinceLastAttempt: fc.array(fc.string()).map((a) => new Set(a)),
            exitCode: fc.integer({ min: 0, max: 2 }),
          }),
        ),
        (rawAttempts) => {
          const attempts: CheckAttempt[] = rawAttempts;
          const gate = validateConflictResolution(attempts);
          if (gate.escalateToDebug) {
            expect(gate.passed).toBe(false);
          }
        },
      ),
    );
  });
});
