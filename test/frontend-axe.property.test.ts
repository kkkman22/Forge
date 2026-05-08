import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseAxeResult } from "../src/frontend-check.js";

const impactArb = fc.constantFrom("critical", "serious", "moderate", "minor");

function violationArb() {
  return fc.record({
    id: fc.string({ minLength: 1 }),
    impact: impactArb,
    description: fc.string(),
    tags: fc.array(fc.string()),
    nodes: fc.array(fc.record({ html: fc.string() })),
  });
}

function axeResultArb() {
  return fc.record({
    violations: fc.array(violationArb()),
  });
}

describe("parseAxeResult — property", () => {
  it("never throws for any input", () => {
    fc.assert(
      fc.property(fc.anything(), (json) => {
        expect(() => parseAxeResult(json)).not.toThrow();
      }),
    );
  });

  it("counts match violations", () => {
    fc.assert(
      fc.property(axeResultArb(), (data) => {
        const result = parseAxeResult(data);
        const total = result.p0 + result.p1 + result.p2 + result.p3;
        expect(total).toBe(data.violations.length);
      }),
    );
  });

  it("severity mapping is correct", () => {
    fc.assert(
      fc.property(axeResultArb(), (data) => {
        const result = parseAxeResult(data);
        let expectedP0 = 0;
        let expectedP1 = 0;
        let expectedP2 = 0;
        let expectedP3 = 0;
        for (const v of data.violations) {
          if (v.impact === "critical") expectedP0++;
          else if (v.impact === "serious") expectedP1++;
          else if (v.impact === "moderate") expectedP2++;
          else expectedP3++;
        }
        expect(result.p0).toBe(expectedP0);
        expect(result.p1).toBe(expectedP1);
        expect(result.p2).toBe(expectedP2);
        expect(result.p3).toBe(expectedP3);
      }),
    );
  });

  it("violations array length matches input", () => {
    fc.assert(
      fc.property(axeResultArb(), (data) => {
        const result = parseAxeResult(data);
        expect(result.violations.length).toBe(data.violations.length);
      }),
    );
  });
});

describe("parseAxeResult — unit", () => {
  it("handles empty violations", () => {
    const result = parseAxeResult({ violations: [] });
    expect(result).toEqual({ p0: 0, p1: 0, p2: 0, p3: 0, violations: [] });
  });

  it("handles null input", () => {
    const result = parseAxeResult(null);
    expect(result).toEqual({ p0: 0, p1: 0, p2: 0, p3: 0, violations: [] });
  });

  it("maps critical to P0", () => {
    const result = parseAxeResult({
      violations: [{ id: "test", impact: "critical", description: "t", tags: [], nodes: [] }],
    });
    expect(result.p0).toBe(1);
    expect(result.violations[0].id).toBe("test");
  });

  it("maps unknown impact to P3", () => {
    const result = parseAxeResult({
      violations: [{ id: "x", impact: "unknown", description: "", tags: [], nodes: [] }],
    });
    expect(result.p3).toBe(1);
  });
});
