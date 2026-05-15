import { describe, it, expect } from "vitest";
import {
  computeAmbiguityScore,
  classifyVerdict,
  type SpecHealthDimension,
  type DimensionScore,
} from "../src/spec-health.js";

function makeDim(dimension: SpecHealthDimension, errorCount: number): DimensionScore {
  return { dimension, passed: errorCount === 0, errorCount, details: [] };
}

describe("computeAmbiguityScore", () => {
  it("returns 1.0 when all dimensions have zero errors", () => {
    const dims = {
      leak: makeDim("leak", 0),
      scenario: makeDim("scenario", 0),
      glossary: makeDim("glossary", 0),
    };
    expect(computeAmbiguityScore(dims)).toBe(1.0);
  });

  it("returns 0 when leak_count=5, scenario_errors=3, glossary_miss=5", () => {
    const dims = {
      leak: makeDim("leak", 5),
      scenario: makeDim("scenario", 3),
      glossary: makeDim("glossary", 5),
    };
    expect(computeAmbiguityScore(dims)).toBe(0);
  });

  it("leak saturation (5 errors) drops score by at least 0.4", () => {
    const allClean = {
      leak: makeDim("leak", 0),
      scenario: makeDim("scenario", 0),
      glossary: makeDim("glossary", 0),
    };
    const leakOnly = {
      leak: makeDim("leak", 5),
      scenario: makeDim("scenario", 0),
      glossary: makeDim("glossary", 0),
    };
    const diff = computeAmbiguityScore(allClean) - computeAmbiguityScore(leakOnly);
    expect(diff).toBeGreaterThanOrEqual(0.4);
  });

  it("score never goes below 0", () => {
    const dims = {
      leak: makeDim("leak", 100),
      scenario: makeDim("scenario", 100),
      glossary: makeDim("glossary", 100),
    };
    expect(computeAmbiguityScore(dims)).toBeGreaterThanOrEqual(0);
  });

  it("score never exceeds 1", () => {
    const dims = {
      leak: makeDim("leak", 0),
      scenario: makeDim("scenario", 0),
      glossary: makeDim("glossary", 0),
    };
    expect(computeAmbiguityScore(dims)).toBeLessThanOrEqual(1);
  });
});

describe("classifyVerdict", () => {
  const thresholds = { leak_max: 0, scenario_max: 0, glossary_miss_max: 2, ambiguity_min: 0.7 };

  it("returns healthy for score >= 0.85", () => {
    expect(classifyVerdict(0.85, thresholds)).toBe("healthy");
    expect(classifyVerdict(1.0, thresholds)).toBe("healthy");
  });

  it("returns marginal for 0.7 <= score < 0.85", () => {
    expect(classifyVerdict(0.7, thresholds)).toBe("marginal");
    expect(classifyVerdict(0.84, thresholds)).toBe("marginal");
  });

  it("returns degraded for score < 0.7", () => {
    expect(classifyVerdict(0.69, thresholds)).toBe("degraded");
    expect(classifyVerdict(0, thresholds)).toBe("degraded");
  });
});
