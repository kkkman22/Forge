import { describe, it, expect } from "vitest";
import {
  GLOSSARY_BLOCK_POLICY,
  type GlossaryCheckPhase,
  type GlossaryCheckMode,
  hashCandidates,
  normalizeInput,
} from "../src/glossary-hook.js";
import type { GlossaryCheckInput } from "../src/glossary-hook.js";
import type { TermCandidate } from "../src/glossary-extractor.js";
import type { Glossary, GlossaryTerm } from "../src/glossary.js";

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

const emptyGlossary: Glossary = {
  schema_version: 1,
  updated: "2026-01-01",
  terms: [],
};

describe("normalizeInput", () => {
  it("candidates kind converts GlossaryTerm[] to TermCandidate[]", () => {
    const terms: GlossaryTerm[] = [
      { term: "Foo", definition: "A foo", last_updated: "2026-01-01" },
    ];
    const input: GlossaryCheckInput = {
      phase: "decide",
      mode: "interactive",
      rawInput: { kind: "candidates", terms },
      glossary: emptyGlossary,
      now: new Date(),
      alreadyChecked: new Set(),
    };
    const result = normalizeInput(input);
    expect(result).toHaveLength(1);
    expect(result[0].term).toBe("Foo");
    expect(result[0].context).toBe("A foo");
  });

  it("spec_content kind extracts candidates from markdown", () => {
    const input: GlossaryCheckInput = {
      phase: "spec",
      mode: "interactive",
      rawInput: {
        kind: "spec_content",
        markdown:
          "Event Sourcing for the Command Handler pattern. Event Sourcing captures all changes. Command Handler dispatches commands.",
      },
      glossary: emptyGlossary,
      now: new Date(),
      alreadyChecked: new Set(),
    };
    const result = normalizeInput(input);
    expect(result.length).toBeGreaterThan(0);
    const terms = result.map((c) => c.term);
    expect(terms).toContain("Event Sourcing");
  });

  it("plan_content kind extracts from task titles and descriptions", () => {
    const input: GlossaryCheckInput = {
      phase: "plan",
      mode: "interactive",
      rawInput: {
        kind: "plan_content",
        tasks: [
          {
            title: "Event Sourcing module",
            description: "Command Handler pattern for aggregates",
          },
          {
            title: "Event Sourcing integration tests",
            description: "Command Handler event dispatch verification",
          },
        ],
      },
      glossary: emptyGlossary,
      now: new Date(),
      alreadyChecked: new Set(),
    };
    const result = normalizeInput(input);
    expect(result.length).toBeGreaterThan(0);
  });

  it("review_findings kind extracts from finding descriptions", () => {
    const input: GlossaryCheckInput = {
      phase: "review",
      mode: "interactive",
      rawInput: {
        kind: "review_findings",
        findings: [
          {
            description:
              "Command Handler naming inconsistency with CommandHandler",
          },
          {
            description:
              "Command Handler should follow the same pattern as elsewhere",
          },
        ],
      },
      glossary: emptyGlossary,
      now: new Date(),
      alreadyChecked: new Set(),
    };
    const result = normalizeInput(input);
    expect(result.length).toBeGreaterThan(0);
  });

  it("commit_message kind extracts from commit text", () => {
    const input: GlossaryCheckInput = {
      phase: "build",
      mode: "interactive",
      rawInput: {
        kind: "commit_message",
        message:
          "feat(glossary): add Event Sourcing support\n\nEvent Sourcing captures all changes as events.",
      },
      glossary: emptyGlossary,
      now: new Date(),
      alreadyChecked: new Set(),
    };
    const result = normalizeInput(input);
    expect(result.length).toBeGreaterThan(0);
  });

  it("session kind extracts from session data", () => {
    const input: GlossaryCheckInput = {
      phase: "learn",
      mode: "interactive",
      rawInput: {
        kind: "session",
        data: {
          decisions: [
            "Event Sourcing pattern adopted",
            "Event Sourcing for all aggregates",
          ],
          findings: [],
          reviews: [],
          progress: [],
          sessions: [],
        },
      },
      glossary: emptyGlossary,
      now: new Date(),
      alreadyChecked: new Set(),
    };
    const result = normalizeInput(input);
    expect(result.length).toBeGreaterThan(0);
  });

  it("decision_tree kind extracts from tree text", () => {
    const input: GlossaryCheckInput = {
      phase: "grill",
      mode: "interactive",
      rawInput: {
        kind: "decision_tree",
        tree: {
          rootDescription: "Event Sourcing architecture decision",
          nodes: [
            {
              id: "1",
              category: "architecture",
              question: "Event Sourcing approach?",
              status: "answered",
              userAnswer: "Event Sourcing for all aggregates",
              children: [],
            },
          ],
          createdAt: "2026-01-01",
          lastUpdated: "2026-01-01",
        },
      },
      glossary: emptyGlossary,
      now: new Date(),
      alreadyChecked: new Set(),
    };
    const result = normalizeInput(input);
    expect(result.length).toBeGreaterThan(0);
  });

  it("normalizer is idempotent: same input produces same output", () => {
    const input: GlossaryCheckInput = {
      phase: "spec",
      mode: "interactive",
      rawInput: {
        kind: "spec_content",
        markdown:
          "Use Event Sourcing for the Command Handler. Event Sourcing is key.",
      },
      glossary: emptyGlossary,
      now: new Date(),
      alreadyChecked: new Set(),
    };
    const a = normalizeInput(input);
    const b = normalizeInput(input);
    expect(a.map((c: TermCandidate) => c.term)).toEqual(
      b.map((c: TermCandidate) => c.term),
    );
  });
});
