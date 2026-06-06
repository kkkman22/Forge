/**
 * Integration tests for the grill-time glossary conflict check.
 *
 * Covers Task 4.6 / Requirement 4.7: after each `applyAnswer`, the
 * grill driver calls `checkGrillGlossaryConflicts`. When a user's
 * answer introduces a term whose name clashes with an existing
 * glossary entry under a different definition (or whose alias
 * collides with another term), the driver must pause the loop and
 * surface `renderGrillConflictPrompt` for clarification.
 *
 * These tests drive the pure functions directly; the driver /
 * prompt layer is exercised indirectly via the rendered string.
 *
 * **Validates: Requirements 4.7**
 */

import { describe, expect, it } from "vitest";
import type { Glossary } from "../src/glossary.js";
import {
  applyAnswer,
  checkGrillGlossaryConflicts,
  generateDecisionTree,
  renderGrillConflictPrompt,
} from "../src/grill.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date("2026-05-05T12:00:00Z");

/**
 * Seeded glossary containing an `Event Sourcing` entry with a specific
 * definition. The integration test introduces an answer that redefines
 * `Event Sourcing` with an incompatible meaning to trigger the
 * `same_term_different_definition` conflict path.
 */
const GLOSSARY_WITH_EVENT_SOURCING: Glossary = {
  schema_version: 1,
  updated: "2026-05-05",
  terms: [
    {
      term: "Event Sourcing",
      definition: "Persistence style that records all state changes as an append-only log.",
      last_updated: "2026-05-05",
    },
    {
      term: "Tier",
      definition: "Forge 三维路由中的复杂度维度。",
      aliases: ["档位"],
      last_updated: "2026-05-05",
    },
  ],
};

/** Glossary with avoided_terms to test extended conflict detection. */
const GLOSSARY_WITH_AVOIDED: Glossary = {
  schema_version: 1,
  updated: "2026-05-05",
  terms: [
    {
      term: "Command",
      definition: "An immutable instruction object in CQRS.",
      avoided_terms: ["Action（已废弃）"],
      last_updated: "2026-05-05",
    },
  ],
};

/** Glossary with relations to test relation violation detection. */
const GLOSSARY_WITH_RELATIONS: Glossary = {
  schema_version: 1,
  updated: "2026-05-05",
  terms: [
    {
      term: "Event",
      definition: "Something that happened in the domain.",
      relations: ["Event → Handler"],
      last_updated: "2026-05-05",
    },
  ],
};

const EMPTY_GLOSSARY: Glossary = {
  schema_version: 1,
  updated: "2026-05-05",
  terms: [],
};

// ---------------------------------------------------------------------------
// checkGrillGlossaryConflicts
// ---------------------------------------------------------------------------

describe("checkGrillGlossaryConflicts", () => {
  it("flags a user answer that redefines an existing glossary term with a different meaning", () => {
    // Build a grill tree whose answer reuses the glossary term "Event Sourcing"
    // but supplies a substantively different explanation of what it means.
    const base = generateDecisionTree(
      "Rework the audit pipeline to use Event Sourcing.",
      GLOSSARY_WITH_EVENT_SOURCING,
      FIXED_NOW,
    );
    // Answer redefines Event Sourcing as a caching technique — a meaning the
    // glossary does not endorse. The term surface appears twice so the
    // extractor reaches the default `minFrequency=2` threshold.
    const withAnswer = applyAnswer(
      base,
      "functionality-1",
      "Event Sourcing means we cache DTOs in Redis. Event Sourcing caches DTOs only.",
      FIXED_NOW,
    );

    const result = checkGrillGlossaryConflicts(withAnswer, GLOSSARY_WITH_EVENT_SOURCING, FIXED_NOW);

    expect(result.hasConflict).toBe(true);
    expect(result.conflictingTerms.length).toBeGreaterThan(0);

    const conflict = result.conflictingTerms.find((c) => c.candidate === "Event Sourcing");
    expect(conflict).toBeDefined();
    if (conflict === undefined) return;
    expect(conflict.reason).toBe("same_term_different_definition");
    expect(conflict.existing.term).toBe("Event Sourcing");
    expect(conflict.existing.definition).toBe(
      "Persistence style that records all state changes as an append-only log.",
    );
  });

  it("returns hasConflict=false when no extracted candidate clashes with the glossary", () => {
    const base = generateDecisionTree(
      "Document the Audit Trail workflow.",
      GLOSSARY_WITH_EVENT_SOURCING,
      FIXED_NOW,
    );
    // Mentions a brand-new TitleCase term ("Audit Trail") twice but leaves
    // the glossary-known terms alone.
    const withAnswer = applyAnswer(
      base,
      "functionality-1",
      "We write to an Audit Trail table. The Audit Trail is append-only.",
      FIXED_NOW,
    );

    const result = checkGrillGlossaryConflicts(withAnswer, GLOSSARY_WITH_EVENT_SOURCING, FIXED_NOW);
    expect(result.hasConflict).toBe(false);
    expect(result.conflictingTerms).toEqual([]);
  });

  it("returns hasConflict=false for an empty glossary", () => {
    const tree = generateDecisionTree(
      "Lock Event Sourcing as the default. Event Sourcing wins.",
      EMPTY_GLOSSARY,
      FIXED_NOW,
    );
    const result = checkGrillGlossaryConflicts(tree, EMPTY_GLOSSARY, FIXED_NOW);
    expect(result.hasConflict).toBe(false);
    expect(result.conflictingTerms).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const tree = applyAnswer(
      generateDecisionTree("Event Sourcing rework.", GLOSSARY_WITH_EVENT_SOURCING, FIXED_NOW),
      "functionality-1",
      "Event Sourcing is a caching layer. Event Sourcing is a caching layer only.",
      FIXED_NOW,
    );
    const treeSnapshot = JSON.stringify(tree);
    const glossarySnapshot = JSON.stringify(GLOSSARY_WITH_EVENT_SOURCING);

    checkGrillGlossaryConflicts(tree, GLOSSARY_WITH_EVENT_SOURCING, FIXED_NOW);

    expect(JSON.stringify(tree)).toBe(treeSnapshot);
    expect(JSON.stringify(GLOSSARY_WITH_EVENT_SOURCING)).toBe(glossarySnapshot);
  });

  it("flags avoided_term when tree text contains a glossary-avoided synonym", () => {
    const tree = applyAnswer(
      generateDecisionTree("Use Action pattern for commands.", GLOSSARY_WITH_AVOIDED, FIXED_NOW),
      "functionality-1",
      "We dispatch an Action to mutate state. Action is dispatched synchronously.",
      FIXED_NOW,
    );
    const result = checkGrillGlossaryConflicts(tree, GLOSSARY_WITH_AVOIDED, FIXED_NOW);
    expect(result.extendedConflicts.length).toBeGreaterThan(0);
    const avoided = result.extendedConflicts.find((c) => c.type === "avoided_term");
    expect(avoided).toBeDefined();
    expect(avoided!.detail).toContain("action");
    expect(avoided!.suggestion).toContain("Command");
  });

  it("flags relation_violation when answer reverses the glossary-defined relation", () => {
    const tree = applyAnswer(
      generateDecisionTree("Handle Event in the system.", GLOSSARY_WITH_RELATIONS, FIXED_NOW),
      "functionality-1",
      "The Handler dispatches an Event to the queue. Handler triggers Event processing.",
      FIXED_NOW,
    );
    const result = checkGrillGlossaryConflicts(tree, GLOSSARY_WITH_RELATIONS, FIXED_NOW);
    const violation = result.extendedConflicts.find((c) => c.type === "relation_violation");
    expect(violation).toBeDefined();
    expect(violation!.detail).toContain("Event");
    expect(violation!.detail).toContain("Handler");
  });

  it("skips relation entries that do not match the → pattern", () => {
    const glossaryNoArrow: Glossary = {
      schema_version: 1,
      updated: "2026-05-05",
      terms: [
        {
          term: "Event",
          definition: "Something that happened.",
          relations: ["Event related to Handler"],
          last_updated: "2026-05-05",
        },
      ],
    };
    const tree = applyAnswer(
      generateDecisionTree("Handle Event flow.", glossaryNoArrow, FIXED_NOW),
      "functionality-1",
      "Handler triggers Event in the pipeline. Handler sends Event downstream.",
      FIXED_NOW,
    );
    const result = checkGrillGlossaryConflicts(tree, glossaryNoArrow, FIXED_NOW);
    const violation = result.extendedConflicts.find((c) => c.type === "relation_violation");
    expect(violation).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// renderGrillConflictPrompt
// ---------------------------------------------------------------------------

describe("renderGrillConflictPrompt", () => {
  it("returns an empty string when there are no conflicts", () => {
    expect(
      renderGrillConflictPrompt({
        hasConflict: false,
        conflictingTerms: [],
        extendedConflicts: [],
      }),
    ).toBe("");
  });

  it("renders a non-empty clarification prompt when conflicts are present", () => {
    const base = generateDecisionTree(
      "Rework the audit pipeline to use Event Sourcing.",
      GLOSSARY_WITH_EVENT_SOURCING,
      FIXED_NOW,
    );
    const withAnswer = applyAnswer(
      base,
      "functionality-1",
      "Event Sourcing means caching DTOs in Redis. Event Sourcing caches DTOs only.",
      FIXED_NOW,
    );

    const result = checkGrillGlossaryConflicts(withAnswer, GLOSSARY_WITH_EVENT_SOURCING, FIXED_NOW);
    const prompt = renderGrillConflictPrompt(result);

    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain("glossary conflict");
    expect(prompt).toContain("Event Sourcing");
    expect(prompt).toContain("保留现有 / 替换现有 / 新增别名");
  });

  it("includes the conflict count and every conflict row in order", () => {
    const prompt = renderGrillConflictPrompt({
      hasConflict: true,
      conflictingTerms: [
        {
          candidate: "Alpha",
          existing: { term: "Alpha", definition: "first", last_updated: "2026-05-05" },
          reason: "same_term_different_definition",
        },
        {
          candidate: "Beta",
          existing: { term: "Beta", definition: "second", last_updated: "2026-05-05" },
          reason: "same_term_different_definition",
        },
      ],
      extendedConflicts: [],
    });

    const lines = prompt.split("\n");
    expect(lines[0]).toBe("⚠️ Grill glossary conflict detected (2):");
    expect(lines[1]).toContain('"Alpha"');
    expect(lines[1]).toContain("first");
    expect(lines[2]).toContain('"Beta"');
    expect(lines[2]).toContain("second");
    expect(lines[lines.length - 1]).toBe("请澄清：保留现有 / 替换现有 / 新增别名");
  });
});
