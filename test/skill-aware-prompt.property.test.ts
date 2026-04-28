/**
 * Property-based tests for the Skill-aware prompt construction.
 *
 * Covers:
 *   - Property 4: buildSkillAwarePrompt 字段注入完整性
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { SkillPromptParams } from "../src/context-accumulator.js";
import { buildSkillAwarePrompt } from "../src/context-accumulator.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Positive iteration number. */
const iterationArb = fc.integer({ min: 1, max: 500 });

/**
 * Single-line string without markdown formatting characters.
 * Avoids `###`, `**`, leading `- `, and newlines.
 */
const cleanStringArb = fc
  .string({ minLength: 1, maxLength: 80 })
  .filter((s) => !s.includes("\n") && !s.includes("\r"))
  .map((s) => s.replace(/^- /, "x ").replace(/#{3}/g, "H").replace(/\*\*/g, "xx"))
  .filter((s) => s.length > 0 && s.trim().length > 0 && s === s.trim());

/** Skill phase string (non-empty). */
const skillPhaseArb = fc.constantFrom("build", "review", "plan", "test", "ship", "learn", "router");

/** Tier value. */
const tierArb = fc.constantFrom("light", "standard", "full");

/** Hint object with command, tag, and description. */
const hintArb = fc.record({
  command: cleanStringArb,
  tag: cleanStringArb,
  description: cleanStringArb,
});

/** Fix issue object with severity and description. */
const fixIssueArb = fc.record({
  severity: fc.constantFrom("P0", "P1", "P2"),
  description: cleanStringArb,
});

/** Base iteration prompt params. */
const baseParamsArb = fc.record({
  iteration: iterationArb,
  runId: cleanStringArb,
  objective: cleanStringArb,
  notesContent: cleanStringArb,
});

/** Optional taskType. */
const taskTypeArb = fc.option(
  fc.constantFrom("frontend", "backend", "fullstack", "data", "infra", "docs"),
  { nil: undefined },
);

/** Optional projectPhase. */
const projectPhaseArb = fc.option(
  fc.constantFrom("greenfield", "iteration", "refactor", "bugfix"),
  { nil: undefined },
);

// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 4: buildSkillAwarePrompt 字段注入完整性
// ---------------------------------------------------------------------------

describe("Feature: loop-skills-fusion, Property 4: buildSkillAwarePrompt 字段注入完整性", () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 2.3**
   *
   * When phase is provided (non-empty), the output should contain
   * the phase value and the tier value.
   */
  it("output contains phase value and tier value when phase is provided", () => {
    fc.assert(
      fc.property(baseParamsArb, skillPhaseArb, tierArb, (base, phase, tier) => {
        const params: SkillPromptParams = {
          base,
          skill: { phase, tier },
        };
        const output = buildSkillAwarePrompt(params);

        expect(output).toContain(phase);
        expect(output).toContain(tier);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.5**
   *
   * When phase is empty or missing, the output should contain
   * routing instruction (forge-router).
   */
  it("output contains routing instruction (forge-router) when phase is empty/missing", () => {
    fc.assert(
      fc.property(
        baseParamsArb,
        tierArb,
        fc.constantFrom("", "  ", "   "),
        (base, tier, emptyPhase) => {
          const params: SkillPromptParams = {
            base,
            skill: { phase: emptyPhase, tier },
          };
          const output = buildSkillAwarePrompt(params);

          expect(output).toContain("forge-router");
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.4**
   *
   * When hints are provided, the output should contain all hint descriptions.
   */
  it("output contains all hint descriptions when hints are provided", () => {
    fc.assert(
      fc.property(
        baseParamsArb,
        skillPhaseArb,
        tierArb,
        fc.array(hintArb, { minLength: 1, maxLength: 5 }),
        (base, phase, tier, hints) => {
          const params: SkillPromptParams = {
            base,
            skill: { phase, tier, hints },
          };
          const output = buildSkillAwarePrompt(params);

          for (const hint of hints) {
            expect(output).toContain(hint.description);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.1, 2.2**
   *
   * When fixIssues are provided, the output should contain all fix issue descriptions.
   */
  it("output contains all fix issue descriptions when fixIssues are provided", () => {
    fc.assert(
      fc.property(
        baseParamsArb,
        skillPhaseArb,
        tierArb,
        fc.array(fixIssueArb, { minLength: 1, maxLength: 5 }),
        (base, phase, tier, fixIssues) => {
          const params: SkillPromptParams = {
            base,
            skill: { phase, tier, fixIssues },
          };
          const output = buildSkillAwarePrompt(params);

          for (const issue of fixIssues) {
            expect(output).toContain(issue.description);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.6**
   *
   * Output always contains "mode: autonomous" directive.
   */
  it('output always contains "mode: autonomous"', () => {
    fc.assert(
      fc.property(
        baseParamsArb,
        fc.option(skillPhaseArb, { nil: "" }),
        tierArb,
        fc.option(fc.array(hintArb, { minLength: 0, maxLength: 3 }), { nil: undefined }),
        fc.option(fc.array(fixIssueArb, { minLength: 0, maxLength: 3 }), { nil: undefined }),
        taskTypeArb,
        projectPhaseArb,
        (base, phase, tier, hints, fixIssues, taskType, projectPhase) => {
          const params: SkillPromptParams = {
            base,
            skill: {
              phase: phase ?? "",
              tier,
              ...(hints !== undefined ? { hints } : {}),
              ...(fixIssues !== undefined ? { fixIssues } : {}),
              ...(taskType !== undefined ? { taskType } : {}),
              ...(projectPhase !== undefined ? { projectPhase } : {}),
            },
          };
          const output = buildSkillAwarePrompt(params);

          expect(output).toContain("mode: autonomous");
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 2.2**
   *
   * Output contains taskType and projectPhase when provided.
   */
  it("output contains taskType and projectPhase when provided", () => {
    fc.assert(
      fc.property(
        baseParamsArb,
        skillPhaseArb,
        tierArb,
        fc.constantFrom("frontend", "backend", "fullstack", "data", "infra", "docs"),
        fc.constantFrom("greenfield", "iteration", "refactor", "bugfix"),
        (base, phase, tier, taskType, projectPhase) => {
          const params: SkillPromptParams = {
            base,
            skill: { phase, tier, taskType, projectPhase },
          };
          const output = buildSkillAwarePrompt(params);

          expect(output).toContain(taskType);
          expect(output).toContain(projectPhase);
        },
      ),
      { numRuns: 200 },
    );
  });
});
