/**
 * Property tests for src/compatibility.ts — Claude Code version gating.
 *
 * Validates Requirements 1.3, 1.4, 1.7, 1.8:
 * - Semver comparison: transitivity, anti-symmetry
 * - parseClaudeVersion: extracts version from arbitrary text
 * - checkClaudeVersion: correct verdicts for low/high/unknown/null versions
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

// We'll import from the implementation once it exists
import type { ClaudeVersionCheck, ClaudeVersionRange, VersionVerdict } from "../src/compatibility.js";

// Re-import functions — will fail until implementation exists
// Using dynamic import pattern so the test file compiles but tests fail
describe("compatibility property tests", () => {
  // Helper: arbitrary valid semver string
  const semverArb = fc.tuple(fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 99 }))
    .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

  // Helper: arbitrary claude --version output format
  const versionOutputArb = fc.oneof(
    fc.constantFrom("claude", "Claude Code", "Claude Code CLI", "anthropic/claude"),
    fc.stringMatching(/^[a-zA-Z ]{0,20}/),
  ).chain((prefix) =>
    fc.tuple(
      fc.constant(prefix),
      semverArb,
      fc.oneof(fc.constant(""), fc.stringMatching(/^[a-z ]{0,30}/)),
    ).map(([p, v, suffix]) => `${p} ${v}${suffix}`),
  );

  describe("compareSemver", () => {
    it("satisfies anti-symmetry: compare(a,b) === -compare(b,a)", async () => {
      const { compareSemver } = await import("../src/compatibility.js");
      fc.assert(
        fc.property(semverArb, semverArb, (a, b) => {
          expect(compareSemver(a, b)).toBe(-compareSemver(b, a));
        }),
      );
    });

    it("satisfies transitivity: a<b && b<c → a<c", async () => {
      const { compareSemver } = await import("../src/compatibility.js");
      fc.assert(
        fc.property(semverArb, semverArb, semverArb, (a, b, c) => {
          const ab = compareSemver(a, b);
          const bc = compareSemver(b, c);
          const ac = compareSemver(a, c);
          if (ab < 0 && bc < 0) {
            expect(ac).toBeLessThan(0);
          }
          if (ab > 0 && bc > 0) {
            expect(ac).toBeGreaterThan(0);
          }
        }),
      );
    });

    it("returns 0 for identical versions", async () => {
      const { compareSemver } = await import("../src/compatibility.js");
      fc.assert(
        fc.property(semverArb, (v) => {
          expect(compareSemver(v, v)).toBe(0);
        }),
      );
    });

    it("uses numeric ordering, not string ordering", async () => {
      const { compareSemver } = await import("../src/compatibility.js");
      // "2.1.9" > "2.1.10" in string compare, but "2.1.10" > "2.1.9" in semver
      expect(compareSemver("2.1.10", "2.1.9")).toBe(1);
      expect(compareSemver("2.1.9", "2.1.10")).toBe(-1);
    });
  });

  describe("parseClaudeVersion", () => {
    it("extracts version from arbitrary output formats", async () => {
      const { parseClaudeVersion } = await import("../src/compatibility.js");
      fc.assert(
        fc.property(versionOutputArb, (output) => {
          const result = parseClaudeVersion(output);
          // Should extract something if output contains X.Y.Z pattern
          if (/\d+\.\d+\.\d+/.test(output)) {
            expect(result).not.toBeNull();
            expect(result).toMatch(/^\d+\.\d+\.\d+$/);
          }
        }),
      );
    });

    it("returns null for input with no version pattern", async () => {
      const { parseClaudeVersion } = await import("../src/compatibility.js");
      fc.assert(
        fc.property(fc.stringMatching(/^[a-zA-Z _\-!@#$%^&*()]{1,50}$/), (noVersion) => {
          // Only if it genuinely has no X.Y.Z pattern
          if (!/\d+\.\d+\.\d+/.test(noVersion)) {
            expect(parseClaudeVersion(noVersion)).toBeNull();
          }
        }),
      );
    });
  });

  describe("checkClaudeVersion", () => {
    const defaultRange: ClaudeVersionRange = {
      minimum: "2.1.163",
      verifiedLatest: "2.1.163",
    };

    it("returns non-empty verdict for any input", async () => {
      const { checkClaudeVersion } = await import("../src/compatibility.js");
      fc.assert(
        fc.property(
          fc.oneof(semverArb, fc.constant(null as string | null)),
          (current) => {
            const result = checkClaudeVersion(current, defaultRange);
            expect(["pass", "warn", "fail", "unknown"]).toContain(result.verdict);
            expect(result.reason).toBeDefined();
          },
        ),
      );
    });

    it("null current → verdict unknown with fixHint", async () => {
      const { checkClaudeVersion } = await import("../src/compatibility.js");
      const result = checkClaudeVersion(null, defaultRange);
      expect(result.verdict).toBe("unknown");
      expect(result.fixHint).toContain("claude --version");
      expect(result.currentVersion).toBeNull();
    });

    it("version below minimum → verdict fail", async () => {
      const { checkClaudeVersion } = await import("../src/compatibility.js");
      const result = checkClaudeVersion("2.1.150", defaultRange);
      expect(result.verdict).toBe("fail");
      expect(result.reason).toContain("2.1.150");
      expect(result.reason).toContain("2.1.163");
    });
  });
});
