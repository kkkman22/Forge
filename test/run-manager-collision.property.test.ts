/**
 * Property-based tests for branch collision handling in run-manager and
 * git-transaction modules.
 *
 * Covers:
 *   - Property 4: Branch name deduplication produces unique names
 *   - Property 5: Branch name length is bounded
 *
 * **Validates: Requirements 2.1, 2.5**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { deduplicateBranchName, sanitizeBranchName } from "../src/git-transaction.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Arbitrary objective strings that produce non-empty sanitized slugs. */
const objectiveArb = fc.string({ minLength: 1, maxLength: 200 }).map((s) => {
  // Ensure at least one alphanumeric character so sanitization doesn't empty it
  return `${s}a`;
});

/** UUID-like run IDs (at least 8 chars for the suffix). */
const runIdArb = fc.uuid().map((id) => id);

/** Arbitrary strings of any length for stress-testing the length bound. */
const longStringArb = fc.string({ minLength: 0, maxLength: 500 });

/** Branch name base strings that include the forge/ prefix. */
const branchBaseArb = objectiveArb.map((obj) => {
  const sanitized = sanitizeBranchName(obj);
  return sanitized === "" ? "forge/run-fallback" : `forge/${sanitized}`;
});

// ---------------------------------------------------------------------------
// Feature: forge-audit-remediation, Property 4: Branch name uniqueness
// ---------------------------------------------------------------------------

describe("Feature: forge-audit-remediation, Property 4: Branch name deduplication produces unique names", () => {
  /**
   * **Validates: Requirements 2.1**
   *
   * For any two calls with objectives that produce the same sanitized slug,
   * deduplicateBranchName returns different names when the first name is
   * in the existingBranches list.
   */
  it("deduplicateBranchName returns a different name when baseName collides with existing branches", () => {
    fc.assert(
      fc.property(branchBaseArb, runIdArb, (baseName, runId) => {
        // Simulate collision: baseName already exists
        const existingBranches = [baseName];
        const deduplicated = deduplicateBranchName(baseName, runId, existingBranches);

        // The deduplicated name must differ from the original
        expect(deduplicated).not.toBe(baseName);
      }),
      { numRuns: 40 },
    );
  });

  /**
   * **Validates: Requirements 2.1**
   *
   * When no collision exists, deduplicateBranchName returns the original name.
   */
  it("deduplicateBranchName returns the original name when no collision exists", () => {
    fc.assert(
      fc.property(branchBaseArb, runIdArb, (baseName, runId) => {
        // No collision: existingBranches is empty
        const deduplicated = deduplicateBranchName(baseName, runId, []);

        expect(deduplicated).toBe(baseName);
      }),
      { numRuns: 40 },
    );
  });

  /**
   * **Validates: Requirements 2.1**
   *
   * Two different runIds produce different deduplicated names for the same
   * colliding baseName (assuming the first 8 chars of the runIds differ).
   */
  it("different runIds produce different deduplicated names for the same collision", () => {
    fc.assert(
      fc.property(branchBaseArb, runIdArb, runIdArb, (baseName, runId1, runId2) => {
        // Only test when the first 8 chars differ (which is almost always true for UUIDs)
        fc.pre(runId1.slice(0, 8) !== runId2.slice(0, 8));

        const existingBranches = [baseName];
        const name1 = deduplicateBranchName(baseName, runId1, existingBranches);
        const name2 = deduplicateBranchName(baseName, runId2, existingBranches);

        expect(name1).not.toBe(name2);
      }),
      { numRuns: 40 },
    );
  });

  /**
   * **Validates: Requirements 2.1**
   *
   * The deduplicated name contains the runId prefix (first 8 chars) as suffix.
   */
  it("deduplicated name contains the runId prefix as suffix when collision detected", () => {
    fc.assert(
      fc.property(branchBaseArb, runIdArb, (baseName, runId) => {
        const existingBranches = [baseName];
        const deduplicated = deduplicateBranchName(baseName, runId, existingBranches);
        const suffix = runId.slice(0, 8);

        // The deduplicated name should contain the suffix
        // (may be truncated for very long names, so only check when within bounds)
        if (deduplicated.length <= 250 && baseName.length + 1 + suffix.length <= 250) {
          expect(deduplicated).toBe(`${baseName}-${suffix}`);
        }
      }),
      { numRuns: 40 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: forge-audit-remediation, Property 5: Branch name length bound
// ---------------------------------------------------------------------------

describe("Feature: forge-audit-remediation, Property 5: Branch name length is bounded", () => {
  /**
   * **Validates: Requirements 2.5**
   *
   * For any input string, the resulting branch name from deduplicateBranchName
   * is ≤ 250 characters, regardless of whether deduplication occurs.
   */
  it("deduplicateBranchName output is always ≤ 250 characters (no collision)", () => {
    fc.assert(
      fc.property(longStringArb, runIdArb, (baseName, runId) => {
        const result = deduplicateBranchName(baseName, runId, []);

        expect(result.length).toBeLessThanOrEqual(250);
      }),
      { numRuns: 40 },
    );
  });

  /**
   * **Validates: Requirements 2.5**
   *
   * For any input string with a collision, the deduplicated branch name
   * is ≤ 250 characters.
   */
  it("deduplicateBranchName output is always ≤ 250 characters (with collision)", () => {
    fc.assert(
      fc.property(longStringArb, runIdArb, (baseName, runId) => {
        const result = deduplicateBranchName(baseName, runId, [baseName]);

        expect(result.length).toBeLessThanOrEqual(250);
      }),
      { numRuns: 40 },
    );
  });

  /**
   * **Validates: Requirements 2.5**
   *
   * The full branch name pipeline (sanitize → prefix → deduplicate) always
   * produces names ≤ 250 characters.
   */
  it("full pipeline (sanitize + forge/ prefix + deduplicate) produces names ≤ 250 chars", () => {
    fc.assert(
      fc.property(longStringArb, runIdArb, (objective, runId) => {
        let sanitized = sanitizeBranchName(objective);
        if (sanitized === "") {
          sanitized = `run-${runId.slice(0, 8)}`;
        }
        const baseName = `forge/${sanitized}`;

        // Test both collision and no-collision paths
        const noCollision = deduplicateBranchName(baseName, runId, []);
        const withCollision = deduplicateBranchName(baseName, runId, [baseName]);

        expect(noCollision.length).toBeLessThanOrEqual(250);
        expect(withCollision.length).toBeLessThanOrEqual(250);
      }),
      { numRuns: 40 },
    );
  });
});
