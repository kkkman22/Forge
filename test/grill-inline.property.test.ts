import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type AlreadyTriggered,
  formatInlineGrillInjection,
  type GrillInlineMode,
  type GrillInlineReason,
  type GrillInlineResult,
  renderInlineGrillAdvisory,
  shouldTriggerInlineGrill,
} from "../src/grill-inline.js";

const REASONS: GrillInlineReason[] = [
  "spec_high_ambiguity",
  "decide_requirement_disagreement",
  "decide_user_hesitation",
];

const alreadyTriggeredArb: fc.Arbitrary<AlreadyTriggered> = fc.record({
  spec_high_ambiguity: fc.boolean(),
  decide_requirement_disagreement: fc.boolean(),
  decide_user_hesitation: fc.boolean(),
});

describe("shouldTriggerInlineGrill properties", () => {
  it("autonomous mode always returns trigger=false", () => {
    fc.assert(
      fc.property(fc.constantFrom(...REASONS), alreadyTriggeredArb, (reason, triggered) => {
        const result = shouldTriggerInlineGrill({
          mode: "autonomous",
          reason,
          alreadyTriggered: triggered,
        });
        expect(result.trigger).toBe(false);
        expect(result.rationale).toBe("autonomous_mode");
      }),
    );
  });

  it("interactive + already triggered reason always returns trigger=false", () => {
    fc.assert(
      fc.property(fc.constantFrom(...REASONS), (reason) => {
        const triggered: AlreadyTriggered = {
          spec_high_ambiguity: true,
          decide_requirement_disagreement: true,
          decide_user_hesitation: true,
        };
        const result = shouldTriggerInlineGrill({
          mode: "interactive",
          reason,
          alreadyTriggered: triggered,
        });
        expect(result.trigger).toBe(false);
        expect(result.rationale).toBe("frequency_limit");
      }),
    );
  });

  it("interactive + fresh reason always returns trigger=true", () => {
    fc.assert(
      fc.property(fc.constantFrom(...REASONS), (reason) => {
        const fresh: AlreadyTriggered = {
          spec_high_ambiguity: false,
          decide_requirement_disagreement: false,
          decide_user_hesitation: false,
        };
        const result = shouldTriggerInlineGrill({
          mode: "interactive",
          reason,
          alreadyTriggered: fresh,
        });
        expect(result.trigger).toBe(true);
        expect(result.rationale).toBe(reason);
      }),
    );
  });

  it("is idempotent: same input always yields same output", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("interactive", "autonomous") as fc.Arbitrary<"interactive" | "autonomous">,
        fc.constantFrom(...REASONS),
        alreadyTriggeredArb,
        (mode, reason, triggered) => {
          const input = { mode, reason, alreadyTriggered: triggered };
          const a = shouldTriggerInlineGrill(input);
          const b = shouldTriggerInlineGrill(input);
          expect(a).toEqual(b);
        },
      ),
    );
  });
});

describe("renderInlineGrillAdvisory properties", () => {
  it("output always contains the reason string and '/tinkerman grill'", () => {
    fc.assert(
      fc.property(fc.constantFrom(...REASONS), (reason) => {
        const output = renderInlineGrillAdvisory(reason);
        expect(output).toContain(reason);
        expect(output).toContain("/tinkerman grill");
      }),
    );
  });
});

describe("formatInlineGrillInjection properties", () => {
  const completedResultArb: fc.Arbitrary<GrillInlineResult> = fc.record({
    kind: fc.constant("completed"),
    tree: fc.constant({}),
    alignmentSummary: fc.string({ minLength: 1 }),
  });

  it("completed result always contains alignment summary and mode", () => {
    fc.assert(
      fc.property(
        completedResultArb,
        fc.constantFrom<GrillInlineMode>("spec", "decide"),
        (result, mode) => {
          const output = formatInlineGrillInjection(result, mode);
          if (result.kind === "completed") {
            expect(output).toContain(result.alignmentSummary);
          }
          expect(output).toContain(mode);
        },
      ),
    );
  });
});
