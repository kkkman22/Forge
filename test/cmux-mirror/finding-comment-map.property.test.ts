import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildCommentSetHandoff,
  commentToFinding,
  findingToComment,
  normalizeSeverity,
  roundTrip,
} from "../../scripts/cmux-mirror/lib/finding-comment-map.mjs";

const SEVERITIES = ["P0", "P1", "P2", "P3"] as const;
const SOURCE_LAYERS = ["spec", "quality", "security", "human", "debug"] as const;

// Arbitrary generators
const arbSeverity = fc.constantFrom(...SEVERITIES);
const arbSourceLayer = fc.constantFrom(...SOURCE_LAYERS);
const arbFinding = fc.record({
  file: fc.stringMatching(/^[a-z]+\/[a-z]+\.(ts|md)$/),
  line: fc.oneof(fc.integer({ min: 1, max: 500 }), fc.constant(null)),
  severity: arbSeverity,
  message: fc.string({ minLength: 1, maxLength: 80 }),
  source_layer: arbSourceLayer,
});

describe("finding-comment-map: severity normalization (R2.2)", () => {
  it("canonical P0–P3 pass through unchanged", () => {
    for (const s of SEVERITIES) {
      expect(normalizeSeverity(s)).toBe(s);
      expect(normalizeSeverity(s.toLowerCase())).toBe(s);
    }
  });

  it("out-of-domain severities map to P2 without throwing", () => {
    for (const bad of ["P9", "critical-ish", "", "xyz", 42, null, undefined]) {
      // normalizeSeverity accepts unknown; no @ts-expect-error needed.
      expect(normalizeSeverity(bad)).toBe("P2");
    }
  });

  it("common aliases map to canonical severity", () => {
    expect(normalizeSeverity("critical")).toBe("P0");
    expect(normalizeSeverity("high")).toBe("P1");
    expect(normalizeSeverity("medium")).toBe("P2");
    expect(normalizeSeverity("low")).toBe("P3");
  });
});

describe("finding-comment-map: bidirectional mapping (R2.1)", () => {
  it("findingToComment preserves file/severity/message and applies line fallback", () => {
    const comment = findingToComment({
      file: "src/foo.ts",
      line: 42,
      severity: "P1",
      message: "bug",
      source_layer: "quality",
    });
    expect(comment).toEqual({
      file: "src/foo.ts",
      line: 42,
      severity: "P1",
      message: "bug",
      source_layer: "quality",
    });
  });

  it("missing/null line falls back to 1 (R2.3 deterministic fallback)", () => {
    const c1 = findingToComment({ file: "a.ts", line: null, severity: "P2", message: "x" });
    const c2 = findingToComment({ file: "a.ts", severity: "P2", message: "x" } as never);
    expect(c1.line).toBe(1);
    expect(c2.line).toBe(1);
  });

  it("missing file maps to '<unknown>' (R2.3)", () => {
    const c = findingToComment({ file: "", line: 5, severity: "P0", message: "x" });
    expect(c.file).toBe("<unknown>");
  });

  it("commentToFinding is the inverse shape (source_layer defaults to human)", () => {
    const f = commentToFinding({
      file: "b.ts",
      line: 7,
      severity: "P3",
      message: "note",
      // no source_layer
    } as never);
    expect(f.source_layer).toBe("human");
    expect(f.severity).toBe("P3");
  });
});

describe("finding-comment-map: round-trip property (R2.3 determinism, R2.4 no info loss)", () => {
  it("roundTrip is pure: same input → same output", () => {
    fc.assert(
      fc.property(arbFinding, (f) => {
        const a = roundTrip(f);
        const b = roundTrip(f);
        expect(a).toEqual(b);
      }),
    );
  });

  it("roundTrip preserves message + canonical severity + source_layer (no info loss in-domain)", () => {
    fc.assert(
      fc.property(arbFinding, (f) => {
        const rt = roundTrip(f);
        expect(rt.message).toBe(f.message);
        expect(rt.severity).toBe(f.severity); // already canonical in arb
        expect(rt.source_layer).toBe(f.source_layer);
        expect(rt.file).toBe(f.file);
      }),
    );
  });

  it("roundTrip applies the deterministic line fallback consistently (null line → 1 in comment form)", () => {
    fc.assert(
      fc.property(arbFinding, (f) => {
        const rt = roundTrip(f);
        // After round-trip the comment-form line is always a positive integer.
        // A null source line maps to 1 in the comment and stays 1 on the way back.
        expect(
          rt.line === null || rt.line === undefined || (typeof rt.line === "number" && rt.line > 0),
        ).toBe(true);
        if (f.line === null) {
          // null → comment line 1 → finding line 1 (header fallback is sticky).
          expect(rt.line).toBe(1);
        }
      }),
    );
  });
});

describe("finding-comment-map: buildCommentSetHandoff (R3.1, R3.2)", () => {
  it("produces a payload with topic/source/count/generated_at + ordered comments", () => {
    const findings = [
      { file: "a.ts", line: 1, severity: "P0", message: "x", source_layer: "security" },
      { file: "b.ts", line: 2, severity: "P2", message: "y", source_layer: "quality" },
    ];
    const payload = buildCommentSetHandoff(
      findings as unknown as Parameters<typeof buildCommentSetHandoff>[0],
      { topic: "topic-a", generatedAt: "2026-06-13T00:00:00Z" },
    );
    expect(payload.topic).toBe("topic-a");
    expect(payload.source).toBe("cmux-diff-review");
    expect(payload.count).toBe(2);
    expect(payload.generated_at).toBe("2026-06-13T00:00:00Z");
    expect(payload.comments).toHaveLength(2);
    expect(payload.comments[0].file).toBe("a.ts");
  });

  it("empty findings → count 0, empty comments array (not undefined)", () => {
    const payload = buildCommentSetHandoff([], { topic: "t" });
    expect(payload.count).toBe(0);
    expect(payload.comments).toEqual([]);
  });
});
