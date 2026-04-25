/**
 * Property tests for the Spec engine (Properties 5, 6, 7).
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
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  confirmSpec,
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

/** A valid scenario in "当...则..." format. */
const validScenarioArb: fc.Arbitrary<string> = fc
  .tuple(nonEmptyStringArb, nonEmptyStringArb)
  .map(([condition, result]) => `当${condition}，则${result}`);

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

/** A requirement with NO valid "当...则..." scenarios (negative case). */
const untestableRequirementArb: fc.Arbitrary<Requirement> = fc
  .tuple(
    nonEmptyStringArb,
    nonEmptyStringArb,
    fc.array(
      nonEmptyStringArb.filter((s) => !/当.+则.+/.test(s)),
      { minLength: 0, maxLength: 3 },
    ),
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

        const confirmed = confirmSpec(spec);

        // Status must be "locked" after confirmation
        expect(confirmed.frontmatter.status).toBe("locked");
      }),
      { numRuns: 200 },
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
      { numRuns: 200 },
    );
  });

  it("confirmSpec preserves all other fields (Req 3.3)", () => {
    fc.assert(
      fc.property(draftSpecArb, (spec) => {
        const confirmed = confirmSpec(spec);

        // All fields except status should be preserved
        expect(confirmed.frontmatter.feature).toBe(spec.frontmatter.feature);
        expect(confirmed.frontmatter.date).toBe(spec.frontmatter.date);
        expect(confirmed.purpose).toBe(spec.purpose);
        expect(confirmed.requirements).toEqual(spec.requirements);
        expect(confirmed.exclusions).toEqual(spec.exclusions);
        expect(confirmed.isBrownfield).toBe(spec.isBrownfield);
      }),
      { numRuns: 200 },
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
      { numRuns: 200 },
    );
  });

  it("confirmSpec is idempotent — confirming a locked spec stays locked", () => {
    fc.assert(
      fc.property(draftSpecArb, (spec) => {
        const once = confirmSpec(spec);
        const twice = confirmSpec(once);

        expect(twice.frontmatter.status).toBe("locked");
      }),
      { numRuns: 200 },
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
      { numRuns: 200 },
    );
  });

  it("at least one requirement without valid scenario → validation fails (Req 3.4)", () => {
    fc.assert(
      fc.property(someUntestableRequirementsArb, (requirements) => {
        expect(validateTestability(requirements)).toBe(false);
      }),
      { numRuns: 200 },
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
      { numRuns: 200 },
    );
  });

  it("brownfield spec without Delta section → validation fails (Req 3.6)", () => {
    fc.assert(
      fc.property(brownfieldSpecWithoutDeltaArb, (spec) => {
        expect(spec.isBrownfield).toBe(true);
        expect(spec.delta).toBeUndefined();

        expect(validateBrownfieldDelta(spec)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("brownfield spec with incomplete Delta → validation fails (Req 3.6)", () => {
    fc.assert(
      fc.property(brownfieldSpecIncompleteDeltaArb, (spec) => {
        expect(spec.isBrownfield).toBe(true);

        expect(validateBrownfieldDelta(spec)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("greenfield (non-brownfield) spec → validation passes without Delta (Req 3.6)", () => {
    fc.assert(
      fc.property(greenfieldSpecArb, (spec) => {
        expect(spec.isBrownfield).toBe(false);

        // Non-brownfield specs don't need Delta, so validation passes
        expect(validateBrownfieldDelta(spec)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
