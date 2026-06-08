/**
 * Property tests for the Spec engine (Properties 5, 6, 7, 8, 9).
 *
 * Property 5: Spec 锁定状态转换
 *   - confirmSpec → status "locked", rejectSpec → status "draft"
 *   **Validates: Requirements 3.3**
 *
 * Property 6: Spec 需求可测试性
 *   - Every requirement has ≥1 testable scenario in "当...则..." format
 *   **Validates: Requirements 3.4**
 *
 * Property 7: 棕地 Spec 包含 Delta 章节
 *   - Brownfield Specs must have Delta with 新增, 修改, 不变 subsections
 *   **Validates: Requirements 3.6**
 *
 * Property 8: 导入模式 Spec 创建
 *   - createImportedSpec produces valid draft with importSource
 *   - Imported spec is compatible with confirmSpec/rejectSpec
 *
 * Property 9: confirmSpec 验证前置守卫
 *   - For any SpecDocument where validateTestability returns false, confirmSpec returns failure
 *     with non-empty errors. For any brownfield spec where validateBrownfieldDelta returns false,
 *     same behavior.
 *   **Validates: Requirements 23.1, 23.2, 23.3**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  confirmSpec,
  createImportedSpec,
  type DeltaSection,
  type Requirement,
  rejectSpec,
  type SpecDocument,
  type SpecFrontmatter,
  validateBrownfieldDelta,
  validateTestability,
} from "../src/spec.js";

// ---------------------------------------------------------------------------
// Generators — shared primitives
// ---------------------------------------------------------------------------

/** Non-empty alphanumeric string for names/titles. */
const nonEmptyStringArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
    minLength: 1,
    maxLength: 30,
  })
  .map((chars) => chars.join(""));

/** kebab-case feature name. */
const featureNameArb: fc.Arbitrary<string> = fc
  .array(nonEmptyStringArb, { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join("-"));

/** Date string in YYYY-MM-DD format. */
const dateArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

/** Purpose text. */
const purposeArb: fc.Arbitrary<string> = nonEmptyStringArb;

/** Non-empty list of exclusion strings. */
const exclusionsArb: fc.Arbitrary<string[]> = fc.array(nonEmptyStringArb, {
  minLength: 0,
  maxLength: 5,
});

// ---------------------------------------------------------------------------
// Generators — Property 5: Spec with draft status
// ---------------------------------------------------------------------------

/** Frontmatter always in "draft" status. */
const draftFrontmatterArb: fc.Arbitrary<SpecFrontmatter> = fc
  .tuple(featureNameArb, dateArb)
  .map(([feature, date]) => ({
    feature,
    status: "draft" as const,
    date,
  }));

/** Verifiable assertion keywords for enhanced testability check. */
const verifiableFragments = ["返回", "等于", "包含", "失败", "成功", "通过", "拒绝", "exit", "状态码"];

/** A valid scenario in "当...则..." format with a verifiable result. */
const validScenarioArb: fc.Arbitrary<string> = fc
  .tuple(nonEmptyStringArb, fc.constantFrom(...verifiableFragments), nonEmptyStringArb)
  .map(([condition, verb, rest]) => `当${condition}，则${verb}${rest}`);

/** A requirement with at least one valid scenario. */
const validRequirementArb: fc.Arbitrary<Requirement> = fc
  .tuple(
    nonEmptyStringArb,
    nonEmptyStringArb,
    fc.array(validScenarioArb, { minLength: 1, maxLength: 4 }),
  )
  .map(([title, description, scenarios]) => ({ title, description, scenarios }));

/** A complete draft SpecDocument (non-brownfield for simplicity). */
const draftSpecArb: fc.Arbitrary<SpecDocument> = fc
  .tuple(
    draftFrontmatterArb,
    purposeArb,
    fc.array(validRequirementArb, { minLength: 1, maxLength: 5 }),
    exclusionsArb,
  )
  .map(([frontmatter, purpose, requirements, exclusions]) => ({
    frontmatter,
    purpose,
    requirements,
    exclusions,
    isBrownfield: false,
  }));

// ---------------------------------------------------------------------------
// Generators — Property 6: Requirements with testable scenarios
// ---------------------------------------------------------------------------

/** A requirement with valid "当...则..." scenarios (positive case). */
const testableRequirementArb: fc.Arbitrary<Requirement> = validRequirementArb;

/** A scenario in "当...则..." format WITHOUT a verifiable result keyword. */
const untestableScenarioArb: fc.Arbitrary<string> = fc
  .tuple(nonEmptyStringArb, nonEmptyStringArb)
  .map(([condition, result]) => `当${condition}，则${result}`)
  .filter((s) => {
    const resultMatch = s.match(/则(.+)/);
    if (!resultMatch) return true;
    return !/返回|等于|包含|不存在|exit|状态码|失败|成功|拒绝|通过|为\b|显示|输出|抛出|退出码|不为|为空|非空/.test(resultMatch[1]);
  });

/** A requirement with NO valid testable scenarios (negative case). */
const untestableRequirementArb: fc.Arbitrary<Requirement> = fc
  .tuple(
    nonEmptyStringArb,
    nonEmptyStringArb,
    fc.array(untestableScenarioArb, { minLength: 1, maxLength: 3 }),
  )
  .map(([title, description, scenarios]) => ({ title, description, scenarios }));

/** A non-empty list of requirements where ALL have valid scenarios. */
const allTestableRequirementsArb: fc.Arbitrary<Requirement[]> = fc.array(testableRequirementArb, {
  minLength: 1,
  maxLength: 5,
});

/**
 * A non-empty list of requirements where at least one has NO valid scenario.
 * We generate a mix and ensure at least one untestable requirement is present.
 */
const someUntestableRequirementsArb: fc.Arbitrary<Requirement[]> = fc
  .tuple(
    fc.array(testableRequirementArb, { minLength: 0, maxLength: 3 }),
    untestableRequirementArb,
    fc.array(testableRequirementArb, { minLength: 0, maxLength: 3 }),
  )
  .map(([before, bad, after]) => [...before, bad, ...after]);

// ---------------------------------------------------------------------------
// Generators — Property 7: Brownfield Spec with Delta section
// ---------------------------------------------------------------------------

/** Non-empty string list for Delta subsection entries. */
const deltaEntriesArb: fc.Arbitrary<string[]> = fc.array(nonEmptyStringArb, {
  minLength: 1,
  maxLength: 5,
});

/** A valid Delta section with all three non-empty subsections. */
const validDeltaArb: fc.Arbitrary<DeltaSection> = fc
  .tuple(deltaEntriesArb, deltaEntriesArb, deltaEntriesArb)
  .map(([added, modified, unchanged]) => ({ added, modified, unchanged }));

/** A brownfield SpecDocument with a valid Delta section. */
const brownfieldSpecWithDeltaArb: fc.Arbitrary<SpecDocument> = fc
  .tuple(
    draftFrontmatterArb,
    purposeArb,
    fc.array(validRequirementArb, { minLength: 1, maxLength: 5 }),
    exclusionsArb,
    validDeltaArb,
  )
  .map(([frontmatter, purpose, requirements, exclusions, delta]) => ({
    frontmatter,
    purpose,
    requirements,
    exclusions,
    delta,
    isBrownfield: true,
  }));

/** A brownfield SpecDocument with NO Delta section. */
const brownfieldSpecWithoutDeltaArb: fc.Arbitrary<SpecDocument> = fc
  .tuple(
    draftFrontmatterArb,
    purposeArb,
    fc.array(validRequirementArb, { minLength: 1, maxLength: 5 }),
    exclusionsArb,
  )
  .map(([frontmatter, purpose, requirements, exclusions]) => ({
    frontmatter,
    purpose,
    requirements,
    exclusions,
    isBrownfield: true,
    // delta is undefined — missing
  }));

/**
 * A Delta section where at least one subsection is empty.
 * This represents an incomplete Delta.
 */
const incompleteDeltaArb: fc.Arbitrary<DeltaSection> = fc.oneof(
  // added is empty
  fc
    .tuple(fc.constant([] as string[]), deltaEntriesArb, deltaEntriesArb)
    .map(([added, modified, unchanged]) => ({ added, modified, unchanged })),
  // modified is empty
  fc
    .tuple(deltaEntriesArb, fc.constant([] as string[]), deltaEntriesArb)
    .map(([added, modified, unchanged]) => ({ added, modified, unchanged })),
  // unchanged is empty
  fc
    .tuple(deltaEntriesArb, deltaEntriesArb, fc.constant([] as string[]))
    .map(([added, modified, unchanged]) => ({ added, modified, unchanged })),
);

/** A brownfield SpecDocument with an incomplete Delta section. */
const brownfieldSpecIncompleteDeltaArb: fc.Arbitrary<SpecDocument> = fc
  .tuple(
    draftFrontmatterArb,
    purposeArb,
    fc.array(validRequirementArb, { minLength: 1, maxLength: 5 }),
    exclusionsArb,
    incompleteDeltaArb,
  )
  .map(([frontmatter, purpose, requirements, exclusions, delta]) => ({
    frontmatter,
    purpose,
    requirements,
    exclusions,
    delta,
    isBrownfield: true,
  }));

/** A non-brownfield SpecDocument (no Delta needed). */
const greenfieldSpecArb: fc.Arbitrary<SpecDocument> = draftSpecArb;

// ---------------------------------------------------------------------------
// Property 5: Spec 锁定状态转换
// ---------------------------------------------------------------------------

describe("Property 5: Spec 锁定状态转换", () => {
  it("confirmSpec transitions draft → locked (Req 3.3)", () => {
    fc.assert(
      fc.property(draftSpecArb, (spec) => {
        // Precondition: spec starts as draft
        expect(spec.frontmatter.status).toBe("draft");

        const result = confirmSpec(spec);

        // draftSpecArb generates valid specs (testable requirements, non-brownfield)
        // so confirmSpec should succeed
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.spec.frontmatter.status).toBe("locked");
        }
      }),
      { numRuns: 50 },
    );
  });

  it("rejectSpec keeps status as draft (Req 3.3)", () => {
    fc.assert(
      fc.property(draftSpecArb, (spec) => {
        // Precondition: spec starts as draft
        expect(spec.frontmatter.status).toBe("draft");

        const rejected = rejectSpec(spec);

        // Status must remain "draft" after rejection
        expect(rejected.frontmatter.status).toBe("draft");
      }),
      { numRuns: 50 },
    );
  });

  it("confirmSpec preserves all other fields (Req 3.3)", () => {
    fc.assert(
      fc.property(draftSpecArb, (spec) => {
        const result = confirmSpec(spec);

        expect(result.success).toBe(true);
        if (result.success) {
          const confirmed = result.spec;
          // All fields except status should be preserved
          expect(confirmed.frontmatter.feature).toBe(spec.frontmatter.feature);
          expect(confirmed.frontmatter.date).toBe(spec.frontmatter.date);
          expect(confirmed.purpose).toBe(spec.purpose);
          expect(confirmed.requirements).toEqual(spec.requirements);
          expect(confirmed.exclusions).toEqual(spec.exclusions);
          expect(confirmed.isBrownfield).toBe(spec.isBrownfield);
        }
      }),
      { numRuns: 50 },
    );
  });

  it("rejectSpec preserves all other fields (Req 3.3)", () => {
    fc.assert(
      fc.property(draftSpecArb, (spec) => {
        const rejected = rejectSpec(spec);

        // All fields should be preserved (including status = draft)
        expect(rejected.frontmatter.feature).toBe(spec.frontmatter.feature);
        expect(rejected.frontmatter.date).toBe(spec.frontmatter.date);
        expect(rejected.purpose).toBe(spec.purpose);
        expect(rejected.requirements).toEqual(spec.requirements);
        expect(rejected.exclusions).toEqual(spec.exclusions);
        expect(rejected.isBrownfield).toBe(spec.isBrownfield);
      }),
      { numRuns: 50 },
    );
  });

  it("confirmSpec is idempotent — confirming a locked spec stays locked", () => {
    fc.assert(
      fc.property(draftSpecArb, (spec) => {
        const once = confirmSpec(spec);
        expect(once.success).toBe(true);
        if (!once.success) return;

        const twice = confirmSpec(once.spec);
        expect(twice.success).toBe(true);
        if (twice.success) {
          expect(twice.spec.frontmatter.status).toBe("locked");
        }
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Spec 需求可测试性
// ---------------------------------------------------------------------------

describe("Property 6: Spec 需求可测试性", () => {
  it('all requirements with valid "当...则..." scenarios → validation passes (Req 3.4)', () => {
    fc.assert(
      fc.property(allTestableRequirementsArb, (requirements) => {
        expect(validateTestability(requirements)).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  it("at least one requirement without valid scenario → validation fails (Req 3.4)", () => {
    fc.assert(
      fc.property(someUntestableRequirementsArb, (requirements) => {
        expect(validateTestability(requirements)).toBe(false);
      }),
      { numRuns: 50 },
    );
  });

  it("empty requirements list → validation fails (Req 3.4)", () => {
    expect(validateTestability([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Property 7: 棕地 Spec 包含 Delta 章节
// ---------------------------------------------------------------------------

describe("Property 7: 棕地 Spec 包含 Delta 章节", () => {
  it("brownfield spec with complete Delta → validation passes (Req 3.6)", () => {
    fc.assert(
      fc.property(brownfieldSpecWithDeltaArb, (spec) => {
        expect(spec.isBrownfield).toBe(true);
        expect(spec.delta).toBeDefined();
        expect(spec.delta?.added.length).toBeGreaterThan(0);
        expect(spec.delta?.modified.length).toBeGreaterThan(0);
        expect(spec.delta?.unchanged.length).toBeGreaterThan(0);

        expect(validateBrownfieldDelta(spec)).toBe(true);
      }),
      { numRuns: 50 },
    );
  });

  it("brownfield spec without Delta section → validation fails (Req 3.6)", () => {
    fc.assert(
      fc.property(brownfieldSpecWithoutDeltaArb, (spec) => {
        expect(spec.isBrownfield).toBe(true);
        expect(spec.delta).toBeUndefined();

        expect(validateBrownfieldDelta(spec)).toBe(false);
      }),
      { numRuns: 50 },
    );
  });

  it("brownfield spec with incomplete Delta → validation fails (Req 3.6)", () => {
    fc.assert(
      fc.property(brownfieldSpecIncompleteDeltaArb, (spec) => {
        expect(spec.isBrownfield).toBe(true);

        expect(validateBrownfieldDelta(spec)).toBe(false);
      }),
      { numRuns: 50 },
    );
  });

  it("greenfield (non-brownfield) spec → validation passes without Delta (Req 3.6)", () => {
    fc.assert(
      fc.property(greenfieldSpecArb, (spec) => {
        expect(spec.isBrownfield).toBe(false);

        // Non-brownfield specs don't need Delta, so validation passes
        expect(validateBrownfieldDelta(spec)).toBe(true);
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Generators — Property 8: Import mode
// ---------------------------------------------------------------------------

const importSourceArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom(".forge/inbox/", "docs/", "specs/"),
    nonEmptyStringArb,
    fc.constantFrom(".md", ".txt"),
  )
  .map(([dir, name, ext]) => `${dir}${name}${ext}`);

// ---------------------------------------------------------------------------
// Property 8: 导入模式 Spec 创建
// ---------------------------------------------------------------------------

describe("Property 8: 导入模式 Spec 创建", () => {
  it("createImportedSpec produces draft with importSource", () => {
    fc.assert(
      fc.property(
        featureNameArb,
        dateArb,
        purposeArb,
        fc.array(validRequirementArb, { minLength: 1, maxLength: 5 }),
        exclusionsArb,
        importSourceArb,
        (feature, date, purpose, requirements, exclusions, importSource) => {
          const spec = createImportedSpec(
            feature,
            date,
            purpose,
            requirements,
            exclusions,
            importSource,
            false,
          );

          expect(spec.frontmatter.status).toBe("draft");
          expect(spec.frontmatter.importSource).toBe(importSource);
          expect(spec.frontmatter.feature).toBe(feature);
          expect(spec.purpose).toBe(purpose);
          expect(spec.requirements).toEqual(requirements);
          expect(spec.exclusions).toEqual(exclusions);
          expect(spec.isBrownfield).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("createImportedSpec brownfield with Delta preserves Delta", () => {
    fc.assert(
      fc.property(
        featureNameArb,
        dateArb,
        purposeArb,
        fc.array(validRequirementArb, { minLength: 1, maxLength: 3 }),
        exclusionsArb,
        importSourceArb,
        validDeltaArb,
        (feature, date, purpose, requirements, exclusions, importSource, delta) => {
          const spec = createImportedSpec(
            feature,
            date,
            purpose,
            requirements,
            exclusions,
            importSource,
            true,
            delta,
          );

          expect(spec.isBrownfield).toBe(true);
          expect(spec.delta).toEqual(delta);
          expect(validateBrownfieldDelta(spec)).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("imported spec is compatible with confirmSpec", () => {
    fc.assert(
      fc.property(
        featureNameArb,
        dateArb,
        purposeArb,
        fc.array(validRequirementArb, { minLength: 1, maxLength: 3 }),
        exclusionsArb,
        importSourceArb,
        (feature, date, purpose, requirements, exclusions, importSource) => {
          const spec = createImportedSpec(
            feature,
            date,
            purpose,
            requirements,
            exclusions,
            importSource,
            false,
          );
          const result = confirmSpec(spec);

          expect(result.success).toBe(true);
          if (result.success) {
            expect(result.spec.frontmatter.status).toBe("locked");
            expect(result.spec.frontmatter.importSource).toBe(importSource);
            expect(result.spec.requirements).toEqual(requirements);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it("imported spec is compatible with rejectSpec", () => {
    fc.assert(
      fc.property(
        featureNameArb,
        dateArb,
        purposeArb,
        fc.array(validRequirementArb, { minLength: 1, maxLength: 3 }),
        exclusionsArb,
        importSourceArb,
        (feature, date, purpose, requirements, exclusions, importSource) => {
          const spec = createImportedSpec(
            feature,
            date,
            purpose,
            requirements,
            exclusions,
            importSource,
            false,
          );
          const rejected = rejectSpec(spec);

          expect(rejected.frontmatter.status).toBe("draft");
          expect(rejected.frontmatter.importSource).toBe(importSource);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("imported spec requirements are valid for validateTestability", () => {
    fc.assert(
      fc.property(
        featureNameArb,
        dateArb,
        purposeArb,
        allTestableRequirementsArb,
        exclusionsArb,
        importSourceArb,
        (feature, date, purpose, requirements, exclusions, importSource) => {
          const spec = createImportedSpec(
            feature,
            date,
            purpose,
            requirements,
            exclusions,
            importSource,
            false,
          );

          expect(validateTestability(spec.requirements)).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Generators — Property 9: confirmSpec validation guard
// ---------------------------------------------------------------------------

/**
 * A draft SpecDocument with untestable requirements (non-brownfield).
 * validateTestability will return false for these specs.
 */
const specWithUntestableRequirementsArb: fc.Arbitrary<SpecDocument> = fc
  .tuple(draftFrontmatterArb, purposeArb, someUntestableRequirementsArb, exclusionsArb)
  .map(([frontmatter, purpose, requirements, exclusions]) => ({
    frontmatter,
    purpose,
    requirements,
    exclusions,
    isBrownfield: false,
  }));

/**
 * A brownfield draft SpecDocument with untestable requirements AND missing/incomplete Delta.
 * Both validateTestability and validateBrownfieldDelta will return false.
 */
const brownfieldSpecBothInvalidArb: fc.Arbitrary<SpecDocument> = fc
  .tuple(draftFrontmatterArb, purposeArb, someUntestableRequirementsArb, exclusionsArb)
  .map(([frontmatter, purpose, requirements, exclusions]) => ({
    frontmatter,
    purpose,
    requirements,
    exclusions,
    isBrownfield: true,
    // delta is undefined — missing
  }));

/**
 * A brownfield draft SpecDocument with VALID testable requirements but MISSING Delta.
 * validateTestability passes, but validateBrownfieldDelta fails.
 */
const brownfieldSpecValidReqsMissingDeltaArb: fc.Arbitrary<SpecDocument> = fc
  .tuple(
    draftFrontmatterArb,
    purposeArb,
    fc.array(validRequirementArb, { minLength: 1, maxLength: 5 }),
    exclusionsArb,
  )
  .map(([frontmatter, purpose, requirements, exclusions]) => ({
    frontmatter,
    purpose,
    requirements,
    exclusions,
    isBrownfield: true,
    // delta is undefined — missing
  }));

/**
 * A brownfield draft SpecDocument with VALID testable requirements but INCOMPLETE Delta.
 * validateTestability passes, but validateBrownfieldDelta fails.
 */
const brownfieldSpecValidReqsIncompleteDeltaArb: fc.Arbitrary<SpecDocument> = fc
  .tuple(
    draftFrontmatterArb,
    purposeArb,
    fc.array(validRequirementArb, { minLength: 1, maxLength: 5 }),
    exclusionsArb,
    incompleteDeltaArb,
  )
  .map(([frontmatter, purpose, requirements, exclusions, delta]) => ({
    frontmatter,
    purpose,
    requirements,
    exclusions,
    delta,
    isBrownfield: true,
  }));

// ---------------------------------------------------------------------------
// Property 9: confirmSpec 验证前置守卫
// ---------------------------------------------------------------------------

describe("Property 9: confirmSpec validation guard", () => {
  it("spec with untestable requirements → confirmSpec returns failure with non-empty errors (Req 23.1)", () => {
    fc.assert(
      fc.property(specWithUntestableRequirementsArb, (spec) => {
        expect(validateTestability(spec.requirements)).toBe(false);

        const result = confirmSpec(spec);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some((e) => e.toLowerCase().includes("testable"))).toBe(true);
        }
      }),
      { numRuns: 50 },
    );
  });

  it("brownfield spec with valid requirements but missing/incomplete Delta → confirmSpec returns failure (Req 23.2)", () => {
    fc.assert(
      fc.property(
        fc.oneof(brownfieldSpecValidReqsMissingDeltaArb, brownfieldSpecValidReqsIncompleteDeltaArb),
        (spec) => {
          expect(validateTestability(spec.requirements)).toBe(true);
          expect(validateBrownfieldDelta(spec)).toBe(false);

          const result = confirmSpec(spec);

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors.some((e) => e.toLowerCase().includes("delta"))).toBe(true);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it("spec with both untestable requirements and missing Delta → confirmSpec returns failure with both errors (Req 23.3)", () => {
    fc.assert(
      fc.property(brownfieldSpecBothInvalidArb, (spec) => {
        expect(validateTestability(spec.requirements)).toBe(false);
        expect(validateBrownfieldDelta(spec)).toBe(false);

        const result = confirmSpec(spec);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors.length).toBeGreaterThanOrEqual(2);
          expect(result.errors.some((e) => e.toLowerCase().includes("testable"))).toBe(true);
          expect(result.errors.some((e) => e.toLowerCase().includes("delta"))).toBe(true);
        }
      }),
      { numRuns: 50 },
    );
  });
});
