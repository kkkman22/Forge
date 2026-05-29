import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Finding } from "../../src/review-comment-bitbucket/types.js";
import {
  buildMarker,
  computeFindingHash,
  extractMarker,
} from "../../src/review-comment-bitbucket/finding-hash.js";

const findingArb: fc.Arbitrary<Finding> = fc.record({
  priority: fc.constantFrom("P0", "P1", "P2", "P3"),
  finding_type: fc.string({ minLength: 1, maxLength: 50 }),
  file_path: fc.string({ minLength: 1, maxLength: 100 }),
  line_number: fc.integer({ min: 1, max: 99999 }),
  line_type: fc.constantFrom("ADDED", "REMOVED", "CONTEXT"),
  message: fc.string({ minLength: 1, maxLength: 500 }),
  source_layer: fc.constantFrom("spec-check", "quality-check", "security-check"),
});

const prefixArb = fc.stringMatching(/^[a-zA-Z_-]{1,20}$/);

describe("Property 1: hash stability (deep-equal inputs → same hash)", () => {
  it("computeFindingHash(f) === computeFindingHash(structuredClone(f))", { timeout: 30000 }, () => {
    fc.assert(
      fc.property(findingArb, (f) => {
        const h1 = computeFindingHash(f);
        const h2 = computeFindingHash(structuredClone(f));
        expect(h1).toBe(h2);
      }),
    );
  });
});

describe("Property 2: message tail immunity", () => {
  it("suffix beyond char 100 does not change hash", { timeout: 30000 }, () => {
    const longMsgArb: fc.Arbitrary<Finding> = fc.record({
      priority: fc.constantFrom("P0", "P1", "P2", "P3"),
      finding_type: fc.string({ minLength: 1, maxLength: 50 }),
      file_path: fc.string({ minLength: 1, maxLength: 100 }),
      line_number: fc.integer({ min: 1, max: 99999 }),
      line_type: fc.constantFrom("ADDED", "REMOVED", "CONTEXT"),
      message: fc.string({ minLength: 100, maxLength: 500 }),
      source_layer: fc.constantFrom("spec-check", "quality-check", "security-check"),
    });
    fc.assert(
      fc.property(
        longMsgArb,
        fc.string({ minLength: 1, maxLength: 50 }),
        (f, suffix) => {
          const h1 = computeFindingHash(f);
          const modified = { ...f, message: f.message.slice(0, 100) + suffix };
          const h2 = computeFindingHash(modified);
          expect(h1).toBe(h2);
        },
      ),
    );
  });
});

describe("Property 3: stable field sensitivity", () => {
  it("changing any stable field produces a different hash (statistical)", { timeout: 30000 }, () => {
    fc.assert(
      fc.property(findingArb, (f) => {
        const original = computeFindingHash(f);
        const variants = [
          { ...f, file_path: f.file_path + "_x" },
          { ...f, line_number: f.line_number + 1 },
          { ...f, finding_type: f.finding_type + "_x" },
          { ...f, message: "x" + f.message },
        ];
        for (const v of variants) {
          expect(computeFindingHash(v)).not.toBe(original);
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe("Property 4: marker round-trip", () => {
  it("extractMarker(buildMarker(prefix, hash), prefix) === hash", { timeout: 30000 }, () => {
    fc.assert(
      fc.property(findingArb, prefixArb, (f, prefix) => {
        const hash = computeFindingHash(f);
        const marked = buildMarker(prefix, hash);
        expect(extractMarker(marked, prefix)).toBe(hash);
      }),
    );
  });
});

describe("Property 5: hash format strictness", () => {
  it("hash length is always 12 and matches [a-f0-9]{12}", { timeout: 30000 }, () => {
    fc.assert(
      fc.property(findingArb, (f) => {
        const hash = computeFindingHash(f);
        expect(hash).toHaveLength(12);
        expect(hash).toMatch(/^[a-f0-9]{12}$/);
      }),
    );
  });
});

describe("Unit: separator uses U+0000 (prevents field-concatenation ambiguity)", () => {
  it("findings that collide under a space separator stay distinct", () => {
    const base: Finding = {
      priority: "P0",
      finding_type: "type",
      file_path: "a",
      line_number: 1,
      line_type: "ADDED",
      message: "msg",
      source_layer: "spec-check",
    };
    // Joined with a space, both reduce to the identical key "a 1 b c d";
    // only a non-space (U+0000) separator keeps the field boundaries distinct.
    const a: Finding = { ...base, finding_type: "b c", message: "d" };
    const b: Finding = { ...base, finding_type: "b", message: "c d" };
    expect(computeFindingHash(a)).not.toBe(computeFindingHash(b));
  });
});

describe("Unit: file_path case-sensitive, no separator normalization", () => {
  it("Foo.ts and foo.ts produce different hashes", () => {
    const base: Finding = {
      priority: "P0",
      finding_type: "type",
      file_path: "Foo.ts",
      line_number: 1,
      line_type: "ADDED",
      message: "msg",
      source_layer: "spec-check",
    };
    const lower: Finding = { ...base, file_path: "foo.ts" };
    expect(computeFindingHash(base)).not.toBe(computeFindingHash(lower));
  });

  it("a/b and a\\b produce different hashes", () => {
    const fwd: Finding = {
      priority: "P0",
      finding_type: "type",
      file_path: "a/b",
      line_number: 1,
      line_type: "ADDED",
      message: "msg",
      source_layer: "spec-check",
    };
    const back: Finding = { ...fwd, file_path: "a\\b" };
    expect(computeFindingHash(fwd)).not.toBe(computeFindingHash(back));
  });
});

describe("Unit: extractMarker returns null on mismatch", () => {
  it("returns null when prefix does not match", () => {
    const text = buildMarker("prefix-a", "abc123def456");
    expect(extractMarker(text, "prefix-b")).toBeNull();
  });

  it("returns null when no marker in text", () => {
    expect(extractMarker("just some text", "forge-review")).toBeNull();
  });
});

describe("Unit: extractMarker ignores markers inside code fences", () => {
  it("ignores marker inside triple-backtick code block", () => {
    const hash = "abc123def456";
    const prefix = "forge-review";
    const marker = buildMarker(prefix, hash);
    const text = "```\n" + marker + "\n```";
    expect(extractMarker(text, prefix)).toBeNull();
  });

  it("still extracts marker at text end even if code block exists earlier", () => {
    const hash = "abc123def456";
    const prefix = "forge-review";
    const marker = buildMarker(prefix, hash);
    const text = "```\ncode\n```\n\nsome text\n" + marker;
    expect(extractMarker(text, prefix)).toBe(hash);
  });
});
