import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_ICON, PHASE_TO_ICON } from "../../scripts/cmux-mirror/lib/payload.mjs";
import {
  buildRenderModel,
  reviewVerdictColor,
} from "../../scripts/cmux-mirror/lib/render-model.mjs";

const VALID_PHASES = Object.keys(PHASE_TO_ICON);

describe("render-model: phase totality (R2.2)", () => {
  it("every legal phase maps to exactly one known icon", () => {
    for (const phase of VALID_PHASES) {
      // phase is string from Object.keys; cast to the snapshot input type.
      const model = buildRenderModel({ phase } as Parameters<typeof buildRenderModel>[0]);
      expect(model.phase_region.icon).toBe((PHASE_TO_ICON as Record<string, string>)[phase]);
    }
  });

  it("out-of-domain phase maps to the default (circle) icon, never throws", () => {
    for (const bad of ["", "unknown", "PAUSE", null, 42, undefined]) {
      // @ts-expect-error — intentionally feeding out-of-domain values
      const model = buildRenderModel({ phase: bad });
      expect(model.phase_region.icon).toBe(DEFAULT_ICON);
    }
  });
});

describe("render-model: region folding (R2.4 — missing data hides region)", () => {
  it("a snapshot with only phase hides dag/review/loop regions", () => {
    const model = buildRenderModel({ phase: "build" });
    expect(model.phase_region.phase).toBe("build");
    expect(model.dag_region.visible).toBe(false);
    expect(model.review_region.visible).toBe(false);
    expect(model.loop_region.visible).toBe(false);
  });

  it("a snapshot with dag data shows the dag region with a ratio in [0,1]", () => {
    const model = buildRenderModel({
      phase: "build",
      dag: { done: 3, failed: 1, blocked: 0, in_progress: 1, total: 5 },
    });
    expect(model.dag_region.visible).toBe(true);
    expect(model.dag_region.ratio).toBeCloseTo(0.8); // (3+1)/5
    expect(model.dag_region.total).toBe(5);
  });

  it("zero-total dag does not divide by zero (ratio 0)", () => {
    const model = buildRenderModel({
      phase: "build",
      dag: { done: 0, failed: 0, blocked: 0, in_progress: 0, total: 0 },
    });
    expect(model.dag_region.ratio).toBe(0);
  });
});

describe("render-model: review verdict color (R2.1)", () => {
  it("P0 or P1 presence → red", () => {
    expect(reviewVerdictColor({ p0: 1, p1: 0 })).toBe("red");
    expect(reviewVerdictColor({ p0: 0, p1: 2 })).toBe("red");
    expect(reviewVerdictColor({ p0: 3, p1: 1 })).toBe("red");
  });

  it("P2/P3-only or empty → yellow", () => {
    expect(reviewVerdictColor({ p0: 0, p1: 0 })).toBe("yellow");
    expect(reviewVerdictColor({ p0: 0, p1: 0 })).toBe("yellow");
  });

  it("missing counts default to 0 (no throw)", () => {
    // @ts-expect-error — intentionally missing
    expect(reviewVerdictColor({})).toBe("yellow");
    // @ts-expect-error — intentionally null
    expect(reviewVerdictColor(null)).toBe("yellow");
  });
});

describe("render-model: property — build never throws on arbitrary snapshots (R2.4 fault tolerance)", () => {
  const arbPhase = fc.constantFrom(...VALID_PHASES);
  const arbSnapshot = fc.record({
    phase: arbPhase,
    current_topic: fc.option(fc.string()),
    attention: fc.option(
      fc.array(
        fc.record({
          kind: fc.string(),
          topic: fc.string(),
          severity: fc.constantFrom("P0", "P1", "P2", "P3"),
        }),
      ),
    ),
  });

  it("buildRenderModel is total over arbitrary snapshots", () => {
    fc.assert(
      fc.property(arbSnapshot, (snap) => {
        // Cast to the module's (JSDoc-inferred) snapshot type; the .mjs has no
        // runtime type checking, and fc.constantFrom widens phase to string.
        const model = buildRenderModel(snap as Parameters<typeof buildRenderModel>[0]);
        // Phase region always present with a known icon.
        expect(VALID_PHASES).toContain(model.phase_region.phase);
        expect(model.phase_region.icon).toBeDefined();
        // Attention queue is always an array.
        expect(Array.isArray(model.attention_queue)).toBe(true);
      }),
    );
  });
});
