/**
 * Property-based test for verdict-parser totality.
 *
 * Covers:
 *   - Property: `parseVerdict` always returns one of "VERIFIED", "NOT_VERIFIED",
 *     "INCONCLUSIVE" for any string input (totality) [R13.3].
 *   - Property: valid verdict frontmatters parse to their declared value.
 *   - Property: corrupted / empty / garbage input always yields INCONCLUSIVE.
 *
 * **Validates: Requirements R1.9, R13.3**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseVerdict } from "../src/verdict-parser.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const VALID_VERDICTS = ["VERIFIED", "NOT_VERIFIED", "INCONCLUSIVE"] as const;

/** Arbitrary string simulating a valid verdict.md. */
const validVerdictMd = fc
  .constantFrom(...VALID_VERDICTS)
  .map((v) => `---\nverdict: "${v}"\ntopic: "test"\n---\n# Verdict: ${v}`);

/** Arbitrary corrupted content — known-bad patterns that should yield INCONCLUSIVE. */
const corruptedContent = fc.oneof(
  fc.constant(""),
  fc.constant("---\nverdict: INVALID\n---"),
  fc.constant("---\nmissing_fields: true\n---"),
  fc.constant("not yaml at all <<<<>>>>"),
  fc.constant("<script>alert('xss')</script>"),
  fc.constant("---\nverdict: null\n---"),
  fc.constant("---\nverdict: []\n---"),
  fc.constant("\x00\x01\x02\x03"),
  fc.constant('---\nverdict: "VERIFIED\nmulti\nline"\n---'),
  fc.constant("---\nverdict: maybe_verified\n---"),
  fc.constant("---\nverdict: 42\n---"),
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseVerdict totality property [R13.3]", () => {
  it("returns a valid verdict for any string input (200 iterations)", () => {
    const validSet = new Set<string>(VALID_VERDICTS);

    fc.assert(
      fc.property(fc.string({ maxLength: 2000 }), (content) => {
        const result = parseVerdict(content);
        expect(result).toBeDefined();
        expect(result.verdict).toBeOneOf([...VALID_VERDICTS]);
        expect(validSet.has(result.verdict)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("parses valid VERIFIED frontmatter correctly", () => {
    const result = parseVerdict(
      '---\nverdict: "VERIFIED"\ntopic: "perf"\n---\n# Verdict: VERIFIED',
    );
    expect(result.verdict).toBe("VERIFIED");
    expect(result.topic).toBe("perf");
  });

  it("parses valid NOT_VERIFIED frontmatter correctly", () => {
    const result = parseVerdict(
      '---\nverdict: "NOT_VERIFIED"\ntopic: "bugfix"\n---\n# Verdict: NOT_VERIFIED',
    );
    expect(result.verdict).toBe("NOT_VERIFIED");
  });

  it("parses valid INCONCLUSIVE frontmatter correctly", () => {
    const result = parseVerdict(
      '---\nverdict: "INCONCLUSIVE"\ntopic: "test"\n---\n# Verdict: INCONCLUSIVE',
    );
    expect(result.verdict).toBe("INCONCLUSIVE");
  });

  it("valid verdicts always parse to their declared value", () => {
    fc.assert(
      fc.property(validVerdictMd, (content) => {
        const result = parseVerdict(content);
        expect(VALID_VERDICTS).toContain(result.verdict);
      }),
      { numRuns: 200 },
    );
  });

  it("corrupted input always yields INCONCLUSIVE", () => {
    fc.assert(
      fc.property(corruptedContent, (content) => {
        const result = parseVerdict(content);
        expect(result.verdict).toBe("INCONCLUSIVE");
      }),
      { numRuns: 200 },
    );
  });

  it("returns INCONCLUSIVE for empty string", () => {
    expect(parseVerdict("").verdict).toBe("INCONCLUSIVE");
  });

  it("preserves raw content in result", () => {
    const content = '---\nverdict: "VERIFIED"\n---\nbody';
    const result = parseVerdict(content);
    expect(result.raw).toBe(content);
  });

  it("extracts missing_artifacts when present", () => {
    const result = parseVerdict(
      '---\nverdict: "INCONCLUSIVE"\nmissing_artifacts: ["baseline/bench.json"]\n---',
    );
    expect(result.verdict).toBe("INCONCLUSIVE");
    expect(result.missingArtifacts).toEqual(["baseline/bench.json"]);
  });

  it("extracts inconclusive_reason when present", () => {
    const result = parseVerdict(
      '---\nverdict: "INCONCLUSIVE"\ninconclusive_reason: "no baseline"\n---',
    );
    expect(result.verdict).toBe("INCONCLUSIVE");
    expect(result.inconclusiveReason).toBe("no baseline");
  });
});
