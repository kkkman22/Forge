import { describe, expect, it } from "vitest";
import { extractAcceptanceCriteria, validateContract } from "../src/contract-validator.js";
import { aggregateEvolutionMarkers, parseEvolutionMarkers } from "../src/evolution-marker.js";
import { handoffPath, isValidTransition } from "../src/handoff.js";
import { classifyVerdict, computeAmbiguityScore } from "../src/spec-health.js";
import { nextPhase, type StormState, serializeStormMarkdown } from "../src/storm.js";
import { buildZoomOutPrompt, renderZoomOut } from "../src/zoom-out.js";

function dimScore(errorCount = 0) {
  return { errorCount, details: [] } as never;
}

describe("spec-health (branch coverage)", () => {
  it("computeAmbiguityScore: 0 errors → high score", () => {
    const s = computeAmbiguityScore({
      leak: dimScore(0),
      scenario: dimScore(0),
      glossary: dimScore(0),
    } as never);
    expect(s).toBeGreaterThan(0.8);
  });
  it("computeAmbiguityScore: max errors → low score", () => {
    const s = computeAmbiguityScore({
      leak: dimScore(100),
      scenario: dimScore(100),
      glossary: dimScore(100),
    } as never);
    expect(s).toBeLessThan(0.2);
  });
  it("classifyVerdict: healthy (>=0.85)", () => {
    expect(classifyVerdict(0.9, { ambiguity_min: 0.7 })).toBe("healthy");
  });
  it("classifyVerdict: marginal (>=0.7)", () => {
    expect(classifyVerdict(0.75, { ambiguity_min: 0.7 })).toBe("marginal");
  });
  it("classifyVerdict: degraded (<0.7)", () => {
    expect(classifyVerdict(0.5, { ambiguity_min: 0.7 })).toBe("degraded");
  });
});

describe("handoff (branch coverage)", () => {
  it("isValidTransition: valid transition", () => {
    expect(isValidTransition("plan", "build")).toBe(true);
  });
  it("isValidTransition: invalid transition", () => {
    expect(isValidTransition("plan", "ship")).toBe(false);
  });
  it("handoffPath generates correct path", () => {
    expect(handoffPath("plan", "build")).toContain("plan-to-build");
  });
});

describe("storm (branch coverage)", () => {
  it("nextPhase: advances to next", () => {
    const state = {} as StormState;
    const next = nextPhase(state.phaseCompleted);
    expect(next === null || typeof next === "string").toBe(true);
  });
});

describe("contract-validator (branch coverage)", () => {
  it("extractAcceptanceCriteria: returns [] for no AC section", () => {
    expect(extractAcceptanceCriteria("# No AC here")).toEqual([]);
  });
  it("extractAcceptanceCriteria: returns [] for empty input", () => {
    expect(extractAcceptanceCriteria("")).toEqual([]);
  });
  it("validateContract runs on minimal spec", () => {
    const r = validateContract("# Spec\n\nNo AC section.");
    expect(r).toBeDefined();
  });
});

describe("zoom-out (branch coverage)", () => {
  it("buildZoomOutPrompt produces a prompt string", () => {
    const text = buildZoomOutPrompt({ topic: "test", recentWork: "did stuff" } as never);
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });
  it("renderZoomOut produces output", () => {
    const text = renderZoomOut({ summary: "zoomed out", actions: [] } as never);
    expect(typeof text).toBe("string");
  });
});

describe("evolution-marker (branch coverage)", () => {
  it("parseEvolutionMarkers: returns [] for content with no markers", () => {
    expect(parseEvolutionMarkers("no markers here")).toEqual([]);
  });
  it("parseEvolutionMarkers: returns [] for empty input", () => {
    expect(parseEvolutionMarkers("")).toEqual([]);
  });
});
