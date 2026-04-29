/**
 * Preservation property-based tests for branch-lifecycle functions.
 *
 * These tests verify that existing functions from build.ts and git-transaction.ts
 * remain unchanged — they import from existing modules and assert known behavior
 * using fast-check generators.
 *
 * Properties tested:
 *   1. checkBuildGate preservation (Req 3.1)
 *   2. sanitizeBranchName preservation (Req 3.2)
 *   3. Ship command builders preservation (Req 3.2, 3.3, 3.4)
 *   4. Branch name validation preservation (Req 3.5, 3.6)
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkBuildGate, type PlanStatus, type SpecStatus } from "../src/build.js";
import {
  BranchValidationError,
  buildBranchDeleteCommand,
  buildCheckoutCommand,
  buildMergeCommand,
  buildPushCommand,
  sanitizeBranchName,
  validateBranchName,
} from "../src/git-transaction.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Any valid Spec status. */
const specStatusArb: fc.Arbitrary<SpecStatus> = fc.constantFrom("draft", "locked");

/** Any valid Plan status. */
const planStatusArb: fc.Arbitrary<PlanStatus> = fc.constantFrom("draft", "approved");

/** The one allowed combination: spec="locked" AND plan="approved". */
const allowedCombinationArb: fc.Arbitrary<{ spec: SpecStatus; plan: PlanStatus }> = fc.constant({
  spec: "locked" as SpecStatus,
  plan: "approved" as PlanStatus,
});

/**
 * Any blocked combination: at least one condition is not met.
 * We generate all combinations and filter out the only allowed one.
 */
const blockedCombinationArb: fc.Arbitrary<{ spec: SpecStatus; plan: PlanStatus }> = fc
  .tuple(specStatusArb, planStatusArb)
  .filter(([spec, plan]) => !(spec === "locked" && plan === "approved"))
  .map(([spec, plan]) => ({ spec, plan }));

/** Valid branch name segment: alphanumeric, hyphens, underscores. */
const branchSegmentArb = fc
  .array(
    fc.constantFrom(
      ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-".split(""),
    ),
    {
      minLength: 1,
      maxLength: 20,
    },
  )
  .map((chars) => chars.join(""))
  .filter((s) => s.length > 0);

/** Valid branch name: segments joined by `/`, with prefix. */
const branchNameArb: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom("feature", "forge", "bugfix", "hotfix", "release"), branchSegmentArb)
  .map(([prefix, name]) => `${prefix}/${name}`)
  .filter((name) => {
    // Ensure it passes validateBranchName
    try {
      validateBranchName(name);
      return true;
    } catch {
      return false;
    }
  });

/** Any boolean. */
const _booleanArb = fc.boolean();

/** Remote name: simple alphanumeric identifiers. */
const remoteArb: fc.Arbitrary<string> = fc.constantFrom("origin", "upstream");

/** String with arbitrary characters for sanitization tests. */
const arbitraryStringArb = fc.string({ minLength: 0, maxLength: 50 });

/** String containing git-illegal characters for branch names. */
const illegalBranchCharArb = fc
  .tuple(
    fc.string({ minLength: 0, maxLength: 10 }),
    fc.constantFrom("~", "^", "*", "[", ":", "?", "\\", " ", "{", "}"),
    fc.string({ minLength: 0, maxLength: 10 }),
  )
  .map(([prefix, illegal, suffix]) => `${prefix}${illegal}${suffix}`);

// ---------------------------------------------------------------------------
// Property 1: checkBuildGate preservation (Req 3.1)
// ---------------------------------------------------------------------------

describe("Property 1: checkBuildGate preservation (Req 3.1)", () => {
  it('returns allowed=true with empty reasons for ("locked", "approved")', () => {
    fc.assert(
      fc.property(allowedCombinationArb, ({ spec, plan }) => {
        const result = checkBuildGate(spec, plan);

        expect(result.allowed).toBe(true);
        expect(result.reasons).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });

  it("returns allowed=false with non-empty reasons for all other combinations", () => {
    fc.assert(
      fc.property(blockedCombinationArb, ({ spec, plan }) => {
        const result = checkBuildGate(spec, plan);

        expect(result.allowed).toBe(false);
        expect(result.reasons.length).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });

  it("for any spec/plan combination, allowed is true iff spec=locked AND plan=approved", () => {
    fc.assert(
      fc.property(specStatusArb, planStatusArb, (spec, plan) => {
        const result = checkBuildGate(spec, plan);
        const expectedAllowed = spec === "locked" && plan === "approved";

        expect(result.allowed).toBe(expectedAllowed);
      }),
      { numRuns: 200 },
    );
  });

  it("blocked result includes 'Spec 未锁定' reason when spec is draft", () => {
    fc.assert(
      fc.property(planStatusArb, (plan) => {
        const result = checkBuildGate("draft", plan);

        expect(result.allowed).toBe(false);
        expect(result.reasons.some((r) => r.includes("Spec 未锁定"))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("blocked result includes 'Plan 未批准' reason when plan is draft", () => {
    fc.assert(
      fc.property(specStatusArb, (spec) => {
        const result = checkBuildGate(spec, "draft");

        expect(result.allowed).toBe(false);
        expect(result.reasons.some((r) => r.includes("Plan 未批准"))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("both conditions failing yields exactly two reasons", () => {
    const result = checkBuildGate("draft", "draft");

    expect(result.allowed).toBe(false);
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons.some((r) => r.includes("Spec 未锁定"))).toBe(true);
    expect(result.reasons.some((r) => r.includes("Plan 未批准"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Property 2: sanitizeBranchName preservation (Req 3.2)
// ---------------------------------------------------------------------------

describe("Property 2: sanitizeBranchName preservation (Req 3.2)", () => {
  it("already-valid names pass through unchanged", () => {
    fc.assert(
      fc.property(branchNameArb, (name) => {
        const sanitized = sanitizeBranchName(name);

        expect(sanitized).toBe(name);
      }),
      { numRuns: 200 },
    );
  });

  it("output never contains illegal characters", () => {
    fc.assert(
      fc.property(arbitraryStringArb, (input) => {
        const sanitized = sanitizeBranchName(input);

        // Output should only contain [a-zA-Z0-9\-_./]
        expect(/^[a-zA-Z0-9\-_./]*$/.test(sanitized)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("output never contains consecutive dots", () => {
    fc.assert(
      fc.property(arbitraryStringArb, (input) => {
        const sanitized = sanitizeBranchName(input);

        expect(sanitized.includes("..")).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("output never ends with .lock", () => {
    fc.assert(
      fc.property(arbitraryStringArb, (input) => {
        const sanitized = sanitizeBranchName(input);

        expect(sanitized.toLowerCase().endsWith(".lock")).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("output never has leading or trailing dots, slashes, or dashes", () => {
    fc.assert(
      fc.property(arbitraryStringArb, (input) => {
        const sanitized = sanitizeBranchName(input);

        if (sanitized.length > 0) {
          expect(/^[./-]/.test(sanitized)).toBe(false);
          expect(/[./-]$/.test(sanitized)).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("strips @{ reflog syntax", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc
            .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
              minLength: 1,
              maxLength: 10,
            })
            .map((chars) => chars.join("")),
          fc.constant("@{"),
        ),
        ([prefix, reflog]) => {
          const input = `${prefix}${reflog}`;
          const sanitized = sanitizeBranchName(input);

          expect(sanitized.includes("@")).toBe(false);
          expect(sanitized.includes("{")).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("is idempotent: sanitizing twice yields the same result", () => {
    fc.assert(
      fc.property(arbitraryStringArb, (input) => {
        const first = sanitizeBranchName(input);
        const second = sanitizeBranchName(first);

        expect(second).toBe(first);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Ship command builders preservation (Req 3.2, 3.3, 3.4)
// ---------------------------------------------------------------------------

describe("Property 3: Ship command builders preservation (Req 3.2, 3.3, 3.4)", () => {
  it("buildCheckoutCommand returns valid GitCommand with correct args", () => {
    fc.assert(
      fc.property(branchNameArb, (branch) => {
        const cmd = buildCheckoutCommand(branch);

        expect(cmd.executable).toBe("git");
        expect(cmd.args).toEqual(["checkout", branch]);
      }),
      { numRuns: 200 },
    );
  });

  it("buildMergeCommand returns valid GitCommand with --no-ff when noFf=true", () => {
    fc.assert(
      fc.property(branchNameArb, (branch) => {
        const cmd = buildMergeCommand(branch, true);

        expect(cmd.executable).toBe("git");
        expect(cmd.args).toEqual(["merge", "--no-ff", branch]);
      }),
      { numRuns: 200 },
    );
  });

  it("buildMergeCommand returns valid GitCommand without --no-ff when noFf=false", () => {
    fc.assert(
      fc.property(branchNameArb, (branch) => {
        const cmd = buildMergeCommand(branch, false);

        expect(cmd.executable).toBe("git");
        expect(cmd.args).toEqual(["merge", branch]);
      }),
      { numRuns: 200 },
    );
  });

  it("buildBranchDeleteCommand returns valid GitCommand with -D when force=true", () => {
    fc.assert(
      fc.property(branchNameArb, (branch) => {
        const cmd = buildBranchDeleteCommand(branch, true);

        expect(cmd.executable).toBe("git");
        expect(cmd.args).toEqual(["branch", "-D", branch]);
      }),
      { numRuns: 200 },
    );
  });

  it("buildBranchDeleteCommand returns valid GitCommand with -d when force=false", () => {
    fc.assert(
      fc.property(branchNameArb, (branch) => {
        const cmd = buildBranchDeleteCommand(branch, false);

        expect(cmd.executable).toBe("git");
        expect(cmd.args).toEqual(["branch", "-d", branch]);
      }),
      { numRuns: 200 },
    );
  });

  it("buildPushCommand returns valid GitCommand with -u when setUpstream=true", () => {
    fc.assert(
      fc.property(remoteArb, branchNameArb, (remote, branch) => {
        const cmd = buildPushCommand(remote, branch, true);

        expect(cmd.executable).toBe("git");
        expect(cmd.args).toEqual(["push", "-u", remote, branch]);
      }),
      { numRuns: 200 },
    );
  });

  it("buildPushCommand returns valid GitCommand without -u when setUpstream=false", () => {
    fc.assert(
      fc.property(remoteArb, branchNameArb, (remote, branch) => {
        const cmd = buildPushCommand(remote, branch, false);

        expect(cmd.executable).toBe("git");
        expect(cmd.args).toEqual(["push", remote, branch]);
      }),
      { numRuns: 200 },
    );
  });

  it("command builders reject invalid branch names by throwing BranchValidationError", () => {
    fc.assert(
      fc.property(
        illegalBranchCharArb.filter((s) => s.length > 0),
        (badBranch) => {
          expect(() => buildCheckoutCommand(badBranch)).toThrow(BranchValidationError);
          expect(() => buildMergeCommand(badBranch, true)).toThrow(BranchValidationError);
          expect(() => buildBranchDeleteCommand(badBranch, false)).toThrow(BranchValidationError);
          expect(() => buildPushCommand("origin", badBranch, false)).toThrow(BranchValidationError);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Branch name validation preservation (Req 3.5, 3.6)
// ---------------------------------------------------------------------------

describe("Property 4: Branch name validation preservation (Req 3.5, 3.6)", () => {
  it("valid branch names pass validation without throwing", () => {
    fc.assert(
      fc.property(branchNameArb, (name) => {
        expect(() => validateBranchName(name)).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });

  it("empty string is rejected", () => {
    expect(() => validateBranchName("")).toThrow(BranchValidationError);
  });

  it("names with shell metacharacters are rejected", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          branchSegmentArb,
          fc.constantFrom("`", "$(", ";", "&", "|", '"'),
          branchSegmentArb,
        ),
        ([prefix, meta, suffix]) => {
          const badName = `${prefix}${meta}${suffix}`;
          expect(() => validateBranchName(badName)).toThrow(BranchValidationError);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("names with git-illegal characters are rejected", () => {
    fc.assert(
      fc.property(
        illegalBranchCharArb.filter((s) => s.length > 0),
        (badName) => {
          expect(() => validateBranchName(badName)).toThrow(BranchValidationError);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("names with '..' are rejected", () => {
    fc.assert(
      fc.property(fc.tuple(branchSegmentArb, branchSegmentArb), ([a, b]) => {
        const badName = `${a}..${b}`;
        expect(() => validateBranchName(badName)).toThrow(BranchValidationError);
      }),
      { numRuns: 200 },
    );
  });

  it("names with '@{' are rejected", () => {
    fc.assert(
      fc.property(branchSegmentArb, (segment) => {
        const badName = `${segment}@{0}`;
        expect(() => validateBranchName(badName)).toThrow(BranchValidationError);
      }),
      { numRuns: 200 },
    );
  });

  it("names ending with '.lock' are rejected", () => {
    fc.assert(
      fc.property(branchSegmentArb, (segment) => {
        const badName = `${segment}.lock`;
        expect(() => validateBranchName(badName)).toThrow(BranchValidationError);
      }),
      { numRuns: 200 },
    );
  });

  it("names with leading dots, slashes, or dashes are rejected", () => {
    fc.assert(
      fc.property(fc.constantFrom(".", "/", "-"), branchSegmentArb, (prefix, segment) => {
        const badName = `${prefix}${segment}`;
        expect(() => validateBranchName(badName)).toThrow(BranchValidationError);
      }),
      { numRuns: 200 },
    );
  });

  it("names with trailing dots, slashes, or dashes are rejected", () => {
    fc.assert(
      fc.property(branchSegmentArb, fc.constantFrom(".", "/", "-"), (segment, suffix) => {
        const badName = `${segment}${suffix}`;
        expect(() => validateBranchName(badName)).toThrow(BranchValidationError);
      }),
      { numRuns: 200 },
    );
  });

  it("BranchValidationError has code BRANCH_VALIDATION_ERROR", () => {
    try {
      validateBranchName("");
    } catch (e) {
      expect(e).toBeInstanceOf(BranchValidationError);
      expect((e as BranchValidationError).code).toBe("BRANCH_VALIDATION_ERROR");
    }
  });
});
