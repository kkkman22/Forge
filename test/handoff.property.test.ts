/**
 * Property tests for the Handoff document system.
 *
 * Tests:
 *   - Handoff validation rules
 *   - Stage transition validity
 *   - Render/parse round-trip
 *   - Prior handoff path collection
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type HandoffDocument,
  type HandoffEntry,
  handoffPath,
  isValidTransition,
  parseHandoff,
  priorHandoffPaths,
  renderHandoff,
  STAGE_TRANSITIONS,
  validateHandoffEntry,
} from "../src/handoff.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const nonEmptyStringArb = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0 && !s.includes("\n") && !s.includes("---") && s === s.trim());

const handoffEntryArb: fc.Arbitrary<HandoffEntry> = fc.record({
  decided: fc.array(nonEmptyStringArb, { minLength: 1, maxLength: 5 }),
  rejected: fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 3 }),
  risks: fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 3 }),
  artifacts: fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 5 }),
  remaining: fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 5 }),
});

const stageArb = fc.constantFrom(
  "decide",
  "spec",
  "plan",
  "build",
  "review",
  "test",
  "ship",
  "learn",
);

const transitionArb = fc.constantFrom(...STAGE_TRANSITIONS);

// ---------------------------------------------------------------------------
// Property 33: Handoff validation
// ---------------------------------------------------------------------------

describe("Property 33: Handoff validation", () => {
  it("valid entry with at least one decision passes", () => {
    fc.assert(
      fc.property(handoffEntryArb, (entry) => {
        const result = validateHandoffEntry(entry);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 40 },
    );
  });

  it("empty decided array fails validation", () => {
    const entry: HandoffEntry = {
      decided: [],
      rejected: ["option A"],
      risks: [],
      artifacts: [],
      remaining: [],
    };
    const result = validateHandoffEntry(entry);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Handoff must contain at least one decision");
  });

  it("empty string in any field fails validation", () => {
    const entry: HandoffEntry = {
      decided: ["good decision", "  "],
      rejected: [],
      risks: [],
      artifacts: [],
      remaining: [],
    };
    const result = validateHandoffEntry(entry);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("decided[1] is empty"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property 34: Stage transitions
// ---------------------------------------------------------------------------

describe("Property 34: Stage transitions", () => {
  it("all defined transitions are valid", () => {
    for (const [from, to] of STAGE_TRANSITIONS) {
      expect(isValidTransition(from, to)).toBe(true);
    }
  });

  it("reverse transitions are invalid", () => {
    for (const [from, to] of STAGE_TRANSITIONS) {
      if (from !== to) {
        expect(isValidTransition(to, from)).toBe(false);
      }
    }
  });

  it("self-transitions are invalid", () => {
    fc.assert(
      fc.property(stageArb, (stage) => {
        expect(isValidTransition(stage, stage)).toBe(false);
      }),
      { numRuns: 20 },
    );
  });

  it("skip transitions are invalid (e.g., decide→build)", () => {
    expect(isValidTransition("decide", "build")).toBe(false);
    expect(isValidTransition("decide", "review")).toBe(false);
    expect(isValidTransition("plan", "ship")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Property 35: Render/parse round-trip
// ---------------------------------------------------------------------------

describe("Property 35: Render/parse round-trip", () => {
  it("renderHandoff → parseHandoff preserves all fields", () => {
    fc.assert(
      fc.property(transitionArb, handoffEntryArb, ([from, to], entry) => {
        const doc: HandoffDocument = {
          fromStage: from,
          toStage: to,
          createdAt: "2025-01-15T14:30:00Z",
          entry,
        };
        const rendered = renderHandoff(doc);
        const parsed = parseHandoff(rendered);

        expect(parsed).not.toBeNull();
        const p = parsed as HandoffDocument;
        expect(p.fromStage).toBe(from);
        expect(p.toStage).toBe(to);
        expect(p.createdAt).toBe("2025-01-15T14:30:00Z");
        expect(p.entry.decided).toEqual(entry.decided);
        expect(p.entry.rejected).toEqual(entry.rejected);
        expect(p.entry.risks).toEqual(entry.risks);
        expect(p.entry.artifacts).toEqual(entry.artifacts);
        expect(p.entry.remaining).toEqual(entry.remaining);
      }),
      { numRuns: 40 },
    );
  });

  it("parseHandoff returns null for invalid content", () => {
    expect(parseHandoff("not a handoff")).toBeNull();
    expect(parseHandoff("---\nno closing")).toBeNull();
    expect(parseHandoff("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Property 36: Handoff path generation
// ---------------------------------------------------------------------------

describe("Property 36: Handoff paths", () => {
  it("handoffPath generates correct format", () => {
    fc.assert(
      fc.property(transitionArb, ([from, to]) => {
        const path = handoffPath(from, to);
        expect(path).toBe(`.tinkerman/handoffs/${from}-to-${to}.md`);
        expect(path.endsWith(".md")).toBe(true);
      }),
      { numRuns: 20 },
    );
  });

  it("priorHandoffPaths for build includes decide→spec, spec→plan, plan→build", () => {
    const paths = priorHandoffPaths("build");
    expect(paths).toContain(".tinkerman/handoffs/decide-to-spec.md");
    expect(paths).toContain(".tinkerman/handoffs/spec-to-plan.md");
    expect(paths).toContain(".tinkerman/handoffs/plan-to-build.md");
    expect(paths).not.toContain(".tinkerman/handoffs/build-to-review.md");
  });

  it("priorHandoffPaths for spec includes only decide→spec", () => {
    const paths = priorHandoffPaths("spec");
    expect(paths).toEqual([".tinkerman/handoffs/decide-to-spec.md"]);
  });

  it("priorHandoffPaths for learn includes all transitions", () => {
    const paths = priorHandoffPaths("learn");
    expect(paths).toHaveLength(STAGE_TRANSITIONS.length);
  });
});
