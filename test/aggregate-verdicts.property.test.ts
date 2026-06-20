/**
 * T-02 (Wave 2) — aggregateVerdicts layer health + pyramid shape (Req5).
 *
 * Req5 AC:
 *   AC1: layerHealth {unit, component, contract, e2e}, each {pass, fail, inconclusive}.
 *   AC2: pyramidShape ∈ healthy | e2e-heavy | empty-middle | no-unit | empty.
 *   AC3: blocksShip semantics unchanged (fail > 0).
 *   AC4: accept-gate frontmatter carries layerHealth + pyramidShape.
 *   AC5: pyramidShape is advisory only (does not block ship).
 *
 * Req7: shared isE2eHeavy(scenarios, config) pure fn (gate reuses it).
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ScenarioArtifact } from "../src/accept.js";
import {
  aggregateVerdicts,
  classifyPyramid,
  isE2eHeavy,
  type PyramidConfig,
  type PyramidShape,
  renderAcceptanceReport,
} from "../src/accept-driver.js";

function artifact(
  id: string,
  type: ScenarioArtifact["type"],
  verdict: ScenarioArtifact["verdict"],
): ScenarioArtifact {
  return {
    scenarioId: id,
    source: "explicit",
    givenWhenThen: "g/w/t",
    executedAt: "2026-01-01",
    verdict,
    evidence: [],
    type,
  };
}

describe("aggregateVerdicts — layer health (Req5 AC1)", () => {
  it("groups verdicts by pyramid layer", () => {
    const arts = [
      artifact("u1", "unit", "PASS"),
      artifact("u2", "unit", "FAIL"),
      artifact("c1", "component", "PASS"),
      artifact("ct1", "contract", "INCONCLUSIVE"),
      artifact("a1", "api", "PASS"), // e2e layer
    ];
    const r = aggregateVerdicts(arts);
    expect(r.layerHealth).toEqual({
      unit: { pass: 1, fail: 1, inconclusive: 0 },
      component: { pass: 1, fail: 0, inconclusive: 0 },
      contract: { pass: 0, fail: 0, inconclusive: 1 },
      e2e: { pass: 1, fail: 0, inconclusive: 0 },
    });
  });

  it("treats api/ui/cli/mixed as the e2e layer", () => {
    const arts = [
      artifact("a", "api", "PASS"),
      artifact("u", "ui", "FAIL"),
      artifact("c", "cli", "INCONCLUSIVE"),
    ];
    const r = aggregateVerdicts(arts);
    expect(r.layerHealth.e2e).toEqual({ pass: 1, fail: 1, inconclusive: 1 });
    expect(r.layerHealth.unit).toEqual({ pass: 0, fail: 0, inconclusive: 0 });
  });

  it("artifacts without type are not counted in any layer (not crashed)", () => {
    const arts: ScenarioArtifact[] = [
      {
        scenarioId: "x",
        source: "explicit",
        givenWhenThen: "g/w/t",
        executedAt: "x",
        verdict: "PASS",
        evidence: [],
      },
    ];
    const r = aggregateVerdicts(arts);
    expect(r.layerHealth).toEqual({
      unit: { pass: 0, fail: 0, inconclusive: 0 },
      component: { pass: 0, fail: 0, inconclusive: 0 },
      contract: { pass: 0, fail: 0, inconclusive: 0 },
      e2e: { pass: 0, fail: 0, inconclusive: 0 },
    });
  });

  it("empty input → zero layer health", () => {
    const r = aggregateVerdicts([]);
    expect(r.layerHealth).toEqual({
      unit: { pass: 0, fail: 0, inconclusive: 0 },
      component: { pass: 0, fail: 0, inconclusive: 0 },
      contract: { pass: 0, fail: 0, inconclusive: 0 },
      e2e: { pass: 0, fail: 0, inconclusive: 0 },
    });
    expect(r.pyramidShape).toBe("empty");
  });
});

describe("aggregateVerdicts — pyramidShape classification (Req5 AC2)", () => {
  it("empty → 'empty'", () => {
    expect(aggregateVerdicts([]).pyramidShape).toBe("empty");
  });

  it("only e2e scenarios → 'e2e-heavy'", () => {
    const arts = [artifact("a1", "api", "PASS"), artifact("a2", "ui", "PASS")];
    expect(aggregateVerdicts(arts).pyramidShape).toBe("e2e-heavy");
  });

  it("e2e + unit but no component/contract → 'empty-middle' (middle layer empty)", () => {
    // empty-middle: unit + e2e present, but the component/contract middle is empty.
    const arts = [artifact("a1", "api", "PASS"), artifact("u1", "unit", "PASS")];
    expect(aggregateVerdicts(arts).pyramidShape).toBe("empty-middle");
  });

  it("e2e + component + unit (full distribution) → 'healthy'", () => {
    const arts = [
      artifact("a1", "api", "PASS"),
      artifact("c1", "component", "PASS"),
      artifact("u1", "unit", "PASS"),
    ];
    expect(aggregateVerdicts(arts).pyramidShape).toBe("healthy");
  });

  it("unit + middle without e2e → 'healthy'", () => {
    const arts = [artifact("u1", "unit", "PASS"), artifact("c1", "component", "PASS")];
    expect(aggregateVerdicts(arts).pyramidShape).toBe("healthy");
  });

  it("e2e + middle (component/contract) but no unit → 'no-unit'", () => {
    const arts = [artifact("a1", "api", "PASS"), artifact("c1", "component", "PASS")];
    expect(aggregateVerdicts(arts).pyramidShape).toBe("no-unit");
  });

  it("e2e-heavy and empty-middle are distinct: e2e only, no middle, no unit → e2e-heavy takes precedence", () => {
    const arts = [artifact("a1", "api", "PASS")];
    expect(aggregateVerdicts(arts).pyramidShape).toBe("e2e-heavy");
  });
});

describe("classifyPyramid — pure classifier", () => {
  it.each<[PyramidShape, number, number, number, number]>([
    ["empty", 0, 0, 0, 0],
    ["healthy", 1, 0, 1, 1], // unit, _, contract, e2e
    ["e2e-heavy", 0, 0, 0, 3],
    ["no-unit", 0, 1, 1, 1], // no unit, middle+e2e
    ["empty-middle", 1, 0, 0, 1], // unit + e2e, no middle
  ])("classifies counts → %s", (expected, unit, component, contract, e2e) => {
    expect(classifyPyramid({ unit, component, contract, e2e })).toBe(expected);
  });
});

describe("aggregateVerdicts — blocksShip unchanged (Req5 AC3, AC5)", () => {
  it("any FAIL → blocksShip true (pyramidShape is advisory)", () => {
    const arts = [
      artifact("u1", "unit", "FAIL"),
      artifact("a1", "api", "PASS"),
      artifact("c1", "component", "PASS"),
    ];
    const r = aggregateVerdicts(arts);
    expect(r.blocksShip).toBe(true);
    expect(r.pyramidShape).toBe("healthy"); // advisory, does not block
  });

  it("e2e-heavy shape alone does NOT block ship (advisory)", () => {
    const arts = [artifact("a1", "api", "PASS"), artifact("a2", "ui", "PASS")];
    const r = aggregateVerdicts(arts);
    expect(r.pyramidShape).toBe("e2e-heavy");
    expect(r.blocksShip).toBe(false);
  });
});

describe("aggregateVerdicts — property (counts invariant)", () => {
  function typedArtifactArb(): fc.Arbitrary<ScenarioArtifact> {
    return fc.record({
      scenarioId: fc.string({ minLength: 1 }),
      source: fc.constantFrom("explicit", "derived"),
      givenWhenThen: fc.string(),
      executedAt: fc.string(),
      verdict: fc.constantFrom("PASS", "FAIL", "SKIP", "WARN", "INCONCLUSIVE"),
      evidence: fc.array(fc.string()),
      type: fc.constantFrom(
        "unit",
        "component",
        "contract",
        "api",
        "ui",
        "cli",
        "mixed",
        "unknown",
      ),
    });
  }

  it("flat counts sum equals total (unchanged)", () => {
    fc.assert(
      fc.property(fc.array(typedArtifactArb()), (arts) => {
        const r = aggregateVerdicts(arts);
        const flat = r.pass + r.fail + r.skip + r.warn + r.inconclusive;
        expect(flat).toBe(arts.length);
      }),
    );
  });

  it("layer health pass+fail+inconclusive never exceeds total per layer", () => {
    fc.assert(
      fc.property(fc.array(typedArtifactArb()), (arts) => {
        const r = aggregateVerdicts(arts);
        for (const layer of ["unit", "component", "contract", "e2e"] as const) {
          const h = r.layerHealth[layer];
          expect(h.pass + h.fail + h.inconclusive).toBeLessThanOrEqual(arts.length);
        }
      }),
    );
  });

  it("pyramidShape is one of the 5 documented values", () => {
    fc.assert(
      fc.property(fc.array(typedArtifactArb()), (arts) => {
        const r = aggregateVerdicts(arts);
        expect(["healthy", "e2e-heavy", "empty-middle", "no-unit", "empty"]).toContain(
          r.pyramidShape,
        );
      }),
    );
  });
});

describe("renderAcceptanceReport — surfaces layer health + pyramid shape (Req5 AC4)", () => {
  it("renders pyramid shape + layer table when summary carries them", () => {
    const arts = [
      artifact("u1", "unit", "PASS"),
      artifact("c1", "component", "FAIL"),
      artifact("a1", "api", "PASS"),
    ];
    const summary = aggregateVerdicts(arts);
    const report = renderAcceptanceReport({
      topic: "layered",
      scenarios: arts,
      summary,
    });
    expect(report).toContain("**Pyramid Shape**");
    expect(report).toMatch(/healthy|e2e-heavy|empty-middle|no-unit/);
    expect(report).toContain("| Layer | PASS | FAIL | INCONCLUSIVE |");
    expect(report).toContain("component");
  });

  it("omits pyramid section when summary lacks pyramidShape (legacy)", () => {
    const report = renderAcceptanceReport({
      topic: "legacy",
      scenarios: [],
      summary: { pass: 0, fail: 0, skip: 0, warn: 0, inconclusive: 0, blocksShip: false },
    });
    expect(report).not.toContain("**Pyramid Shape**");
  });
});

describe("isE2eHeavy — shared pure fn (Req5/Req7)", () => {
  const config: PyramidConfig = { e2eRatioThreshold: 0.3, strictPyramid: true };

  it("fewer than 3 scenarios → false (small-spec exemption, Req7 AC6)", () => {
    expect(
      isE2eHeavy(
        [
          { type: "api", tags: [] },
          { type: "api", tags: [] },
        ],
        config,
      ),
    ).toBe(false);
  });

  it("e2e ratio > threshold and middle=0 → true", () => {
    expect(
      isE2eHeavy(
        [
          { type: "api", tags: [] },
          { type: "api", tags: [] },
          { type: "api", tags: [] },
          { type: "api", tags: [] },
        ],
        config,
      ),
    ).toBe(true);
  });

  it("e2e ratio > threshold but middle>0 → false (composition pushed down)", () => {
    expect(
      isE2eHeavy(
        [
          { type: "api", tags: [] },
          { type: "api", tags: [] },
          { type: "component", tags: [] },
          { type: "unit", tags: [] },
        ],
        config,
      ),
    ).toBe(false);
  });

  it("@critical e2e scenarios are excluded from the ratio (Req7 AC4)", () => {
    expect(
      isE2eHeavy(
        [
          { type: "api", tags: ["@critical"] },
          { type: "api", tags: ["@critical"] },
          { type: "api", tags: ["@critical"] },
          { type: "api", tags: ["@critical"] },
        ],
        config,
      ),
    ).toBe(false);
  });

  it("strictPyramid false → always false (advisory mode)", () => {
    expect(
      isE2eHeavy(
        [
          { type: "api", tags: [] },
          { type: "api", tags: [] },
          { type: "api", tags: [] },
          { type: "api", tags: [] },
        ],
        { ...config, strictPyramid: false },
      ),
    ).toBe(false);
  });

  it("e2eRatioThreshold 0 → always false (gate disabled)", () => {
    expect(
      isE2eHeavy(
        [
          { type: "api", tags: [] },
          { type: "api", tags: [] },
          { type: "api", tags: [] },
        ],
        { ...config, e2eRatioThreshold: 0 },
      ),
    ).toBe(false);
  });

  it("treats api/ui/cli/mixed as e2e layer", () => {
    expect(
      isE2eHeavy(
        [
          { type: "ui", tags: [] },
          { type: "cli", tags: [] },
          { type: "mixed", tags: [] },
          { type: "api", tags: [] },
        ],
        config,
      ),
    ).toBe(true);
  });
});
