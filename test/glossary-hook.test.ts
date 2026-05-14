import { describe, it, expect } from "vitest";
import {
  GLOSSARY_BLOCK_POLICY,
  type GlossaryCheckPhase,
  type GlossaryCheckMode,
  hashCandidates,
} from "../src/glossary-hook.js";
import type { TermCandidate } from "../src/glossary-extractor.js";

describe("glossary-hook types and constants", () => {
  const allPhases: GlossaryCheckPhase[] = [
    "spec",
    "decide",
    "grill",
    "plan",
    "review",
    "learn",
    "build",
  ];
  const allModes: GlossaryCheckMode[] = ["interactive", "autonomous"];

  it("GLOSSARY_BLOCK_POLICY covers all phase × mode combinations", () => {
    for (const phase of allPhases) {
      for (const mode of allModes) {
        expect(typeof GLOSSARY_BLOCK_POLICY[phase][mode]).toBe("boolean");
      }
    }
  });

  it("block policy matches spec table", () => {
    expect(GLOSSARY_BLOCK_POLICY.spec.interactive).toBe(true);
    expect(GLOSSARY_BLOCK_POLICY.decide.interactive).toBe(true);
    expect(GLOSSARY_BLOCK_POLICY.learn.interactive).toBe(true);
    expect(GLOSSARY_BLOCK_POLICY.grill.interactive).toBe(true);
    expect(GLOSSARY_BLOCK_POLICY.plan.interactive).toBe(false);
    expect(GLOSSARY_BLOCK_POLICY.review.interactive).toBe(false);
    expect(GLOSSARY_BLOCK_POLICY.build.interactive).toBe(false);
    // autonomous never blocks
    for (const phase of allPhases) {
      expect(GLOSSARY_BLOCK_POLICY[phase].autonomous).toBe(false);
    }
  });

  it("hashCandidates returns stable hash for same input", () => {
    const candidates: TermCandidate[] = [
      { term: "Foo", context: "x", frequency: 1 },
      { term: "Bar", context: "y", frequency: 2 },
    ];
    expect(hashCandidates(candidates)).toBe(hashCandidates(candidates));
  });

  it("hashCandidates is order-independent", () => {
    const a: TermCandidate[] = [
      { term: "Foo", context: "x", frequency: 1 },
      { term: "Bar", context: "y", frequency: 2 },
    ];
    const b: TermCandidate[] = [
      { term: "Bar", context: "y", frequency: 2 },
      { term: "Foo", context: "x", frequency: 1 },
    ];
    expect(hashCandidates(a)).toBe(hashCandidates(b));
  });

  it("hashCandidates returns empty string for empty array", () => {
    expect(hashCandidates([])).toBe("");
  });
});
