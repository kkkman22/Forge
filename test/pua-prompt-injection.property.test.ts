/**
 * Property-based tests for PUA context injection into buildSkillAwarePrompt.
 *
 * Covers:
 *   - Property 9: PUA 上下文注入到 buildSkillAwarePrompt
 *   - Property 10: buildSkillAwarePrompt 向后兼容
 *
 * **Validates: Requirements 5.2, 5.3, 5.4, 8.4**
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildSkillAwarePrompt, type SkillPromptParams } from "../src/context-accumulator.js";
import {
  buildPressurePrompt,
  PROACTIVE_INITIATIVE_CHECKLIST,
  type PressureLevel,
} from "../src/pua-engine.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Positive iteration number. */
const iterationArb = fc.integer({ min: 1, max: 500 });

/**
 * Single-line non-empty trimmed string without markdown formatting characters.
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

/** Base iteration prompt params. */
const baseParamsArb = fc.record({
  iteration: iterationArb,
  runId: cleanStringArb,
  objective: cleanStringArb,
  notesContent: cleanStringArb,
});

/** Pressure level arbitrary. */
const pressureLevelArb = fc.constantFrom<PressureLevel>("L0", "L1", "L2", "L3", "L4");

/** High pressure level (L3 or L4) for checklist injection tests. */
const highPressureLevelArb = fc.constantFrom<PressureLevel>("L3", "L4");

/** Low pressure level (L0, L1, L2) for non-checklist tests. */
const lowPressureLevelArb = fc.constantFrom<PressureLevel>("L0", "L1", "L2");

/** Methodology arbitrary. */
const methodologyArb = fc.constantFrom(
  "huawei-rca" as const,
  "musk-algorithm" as const,
  "baidu-search" as const,
  "amazon-backwards" as const,
  "bytedance-ab" as const,
  "alibaba-closure" as const,
  "netflix-keeper" as const,
  "jobs-a-player" as const,
);

/** Failure pattern arbitrary. */
const failurePatternArb = fc.constantFrom(
  "spinning" as const,
  "giving-up" as const,
  "low-quality" as const,
  "guessing" as const,
  "passive-waiting" as const,
  "empty-claim" as const,
);

/** Stall response arbitrary. */
const stallResponseArb = fc.constantFrom(
  "remind" as const,
  "reassess" as const,
  "force-pivot" as const,
);

/**
 * Generate a valid PuaContext by calling the real buildPressurePrompt function.
 * This ensures the pressurePrompt field is realistic and consistent.
 */
const puaContextArb = fc
  .record({
    pressureLevel: pressureLevelArb,
    methodology: fc.option(methodologyArb, { nil: null }),
    failurePattern: fc.option(failurePatternArb, { nil: null }),
    stallResponse: fc.option(stallResponseArb, { nil: null }),
  })
  .map((ctx) => ({
    ...ctx,
    pressurePrompt: buildPressurePrompt(
      ctx.pressureLevel,
      ctx.methodology,
      ctx.failurePattern,
      ctx.stallResponse,
    ),
  }));

/** PuaContext with high pressure (L3/L4) for checklist tests. */
const highPressureContextArb = fc
  .record({
    pressureLevel: highPressureLevelArb,
    methodology: fc.option(methodologyArb, { nil: null }),
    failurePattern: fc.option(failurePatternArb, { nil: null }),
    stallResponse: fc.option(stallResponseArb, { nil: null }),
  })
  .map((ctx) => ({
    ...ctx,
    pressurePrompt: buildPressurePrompt(
      ctx.pressureLevel,
      ctx.methodology,
      ctx.failurePattern,
      ctx.stallResponse,
    ),
  }));

/** PuaContext with low pressure (L0/L1/L2) for non-checklist tests. */
const lowPressureContextArb = fc
  .record({
    pressureLevel: lowPressureLevelArb,
    methodology: fc.option(methodologyArb, { nil: null }),
    failurePattern: fc.option(failurePatternArb, { nil: null }),
    stallResponse: fc.option(stallResponseArb, { nil: null }),
  })
  .map((ctx) => ({
    ...ctx,
    pressurePrompt: buildPressurePrompt(
      ctx.pressureLevel,
      ctx.methodology,
      ctx.failurePattern,
      ctx.stallResponse,
    ),
  }));

/** SkillPromptParams without puaContext. */
const baseSkillParamsArb = fc.record({
  base: baseParamsArb,
  skill: fc.record({
    phase: fc.oneof(skillPhaseArb, fc.constant("")),
    tier: tierArb,
  }),
});

// ---------------------------------------------------------------------------
// Feature: pua-quality-engine, Property 9: PUA 上下文注入到 buildSkillAwarePrompt
// ---------------------------------------------------------------------------

describe("Feature: pua-quality-engine, Property 9: PUA 上下文注入到 buildSkillAwarePrompt", () => {
  /**
   * **Validates: Requirements 5.2**
   *
   * When puaContext is provided, the output contains the pressurePrompt text.
   */
  it("output contains puaContext.pressurePrompt when puaContext is provided", () => {
    fc.assert(
      fc.property(baseSkillParamsArb, puaContextArb, (skillParams, puaContext) => {
        const params: SkillPromptParams = {
          ...skillParams,
          puaContext,
        };
        const output = buildSkillAwarePrompt(params);

        expect(output).toContain(puaContext.pressurePrompt);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 5.4**
   *
   * The PUA section appears AFTER "## SKILL Context" in the output.
   */
  it("PUA Quality Engine section appears after SKILL Context section", () => {
    fc.assert(
      fc.property(baseSkillParamsArb, puaContextArb, (skillParams, puaContext) => {
        const params: SkillPromptParams = {
          ...skillParams,
          puaContext,
        };
        const output = buildSkillAwarePrompt(params);

        const skillContextIndex = output.indexOf("## SKILL Context");
        const puaEngineIndex = output.indexOf("## PUA Quality Engine");

        expect(skillContextIndex).toBeGreaterThanOrEqual(0);
        expect(puaEngineIndex).toBeGreaterThanOrEqual(0);
        expect(puaEngineIndex).toBeGreaterThan(skillContextIndex);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 5.2, 5.4**
   *
   * When pressureLevel is L3 or L4, the output also contains
   * PROACTIVE_INITIATIVE_CHECKLIST.
   */
  it("output contains PROACTIVE_INITIATIVE_CHECKLIST when pressureLevel is L3 or L4", () => {
    fc.assert(
      fc.property(baseSkillParamsArb, highPressureContextArb, (skillParams, puaContext) => {
        const params: SkillPromptParams = {
          ...skillParams,
          puaContext,
        };
        const output = buildSkillAwarePrompt(params);

        expect(output).toContain(PROACTIVE_INITIATIVE_CHECKLIST);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * When pressureLevel is L0, L1, or L2, the output does NOT contain
   * PROACTIVE_INITIATIVE_CHECKLIST.
   */
  it("output does NOT contain PROACTIVE_INITIATIVE_CHECKLIST when pressureLevel is L0/L1/L2", () => {
    fc.assert(
      fc.property(baseSkillParamsArb, lowPressureContextArb, (skillParams, puaContext) => {
        const params: SkillPromptParams = {
          ...skillParams,
          puaContext,
        };
        const output = buildSkillAwarePrompt(params);

        expect(output).not.toContain(PROACTIVE_INITIATIVE_CHECKLIST);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: pua-quality-engine, Property 10: buildSkillAwarePrompt 向后兼容
// ---------------------------------------------------------------------------

describe("Feature: pua-quality-engine, Property 10: buildSkillAwarePrompt 向后兼容", () => {
  /**
   * **Validates: Requirements 5.3, 8.4**
   *
   * When puaContext is undefined, the output is identical to calling
   * without puaContext.
   */
  it("output is identical when puaContext is undefined vs not provided", () => {
    fc.assert(
      fc.property(baseSkillParamsArb, (skillParams) => {
        // Call with explicit undefined
        const paramsWithUndefined: SkillPromptParams = {
          ...skillParams,
          puaContext: undefined,
        };
        const outputWithUndefined = buildSkillAwarePrompt(paramsWithUndefined);

        // Call without puaContext field at all
        const paramsWithout: SkillPromptParams = {
          base: skillParams.base,
          skill: skillParams.skill,
        };
        const outputWithout = buildSkillAwarePrompt(paramsWithout);

        expect(outputWithUndefined).toBe(outputWithout);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 5.3, 8.4**
   *
   * When puaContext is undefined, the output does NOT contain
   * "## PUA Quality Engine" section header.
   */
  it("output does not contain PUA Quality Engine section when puaContext is undefined", () => {
    fc.assert(
      fc.property(baseSkillParamsArb, (skillParams) => {
        const params: SkillPromptParams = {
          ...skillParams,
          puaContext: undefined,
        };
        const output = buildSkillAwarePrompt(params);

        expect(output).not.toContain("## PUA Quality Engine");
      }),
      { numRuns: 200 },
    );
  });
});
