/**
 * Property tests for checkReviewFreshness (design.md Properties 1-4).
 *
 * Validates the commit freshness check pure function against 4 correctness properties:
 *   - Property 1: Backward compatibility (undefined commit → always fresh)
 *   - Property 2: Same commit → always fresh
 *   - Property 3: Only .tinkerman/ changes → always fresh
 *   - Property 4: Any project code change → not fresh
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkReviewFreshness } from "../src/ship.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Random commit hash. */
const commitHashArb = fc.string({ minLength: 7, maxLength: 40 }).map((s) => s.replace(/\s/g, "a"));

/** File path that starts with `.tinkerman/`. */
const forgeFileArb = fc.string({ minLength: 1, maxLength: 20 }).map((s) => `.tinkerman/${s}`);

/** File path that does NOT start with `.tinkerman/`. */
const projectFileArb = fc
  .tuple(fc.string({ minLength: 1, maxLength: 10 }), fc.string({ minLength: 1, maxLength: 10 }))
  .filter(([prefix]) => prefix !== ".tinkerman")
  .map(([prefix, name]) => `${prefix}/${name}`);

/** Any file path. */
const anyFileArb = fc.oneof(forgeFileArb, projectFileArb);

/** Array of only .tinkerman/ files. */
const forgeOnlyFilesArb = fc.array(forgeFileArb, { minLength: 0, maxLength: 10 });

/** Array with at least one project file. */
const arrayWithProjectFileArb: fc.Arbitrary<string[]> = fc
  .tuple(
    fc.array(anyFileArb, { minLength: 0, maxLength: 5 }),
    projectFileArb,
    fc.array(anyFileArb, { minLength: 0, maxLength: 5 }),
  )
  .map(([before, project, after]) => [...before, project, ...after]);

// ---------------------------------------------------------------------------
// Property 1: Backward compatibility
// ---------------------------------------------------------------------------

describe("Property 1: undefined reviewedCommit → always fresh (backward compat)", () => {
  it("for any HEAD and any file list, returns fresh: true", () => {
    fc.assert(
      fc.property(commitHashArb, fc.array(anyFileArb), (currentHead, changedFiles) => {
        const result = checkReviewFreshness(undefined, currentHead, changedFiles);
        expect(result.fresh).toBe(true);
        expect(result.reason).toContain("backward compatible");
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Same commit → always fresh
// ---------------------------------------------------------------------------

describe("Property 2: same commit → always fresh", () => {
  it("for any commit hash and any file list, returns fresh: true", () => {
    fc.assert(
      fc.property(commitHashArb, fc.array(anyFileArb), (commit, changedFiles) => {
        const result = checkReviewFreshness(commit, commit, changedFiles);
        expect(result.fresh).toBe(true);
        expect(result.reason).toContain("matches current HEAD");
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Only .tinkerman/ changes → fresh
// ---------------------------------------------------------------------------

describe("Property 3: diff only .tinkerman/ files → always fresh", () => {
  it("for any different commits and .tinkerman/-only file list, returns fresh: true", () => {
    fc.assert(
      fc.property(
        commitHashArb,
        commitHashArb,
        forgeOnlyFilesArb,
        (reviewedCommit, currentHead, changedFiles) => {
          fc.pre(reviewedCommit !== currentHead);
          const result = checkReviewFreshness(reviewedCommit, currentHead, changedFiles);
          expect(result.fresh).toBe(true);
          expect(result.reason).toContain(".tinkerman/");
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Any project code change → not fresh
// ---------------------------------------------------------------------------

describe("Property 4: project code changed → not fresh", () => {
  it("for any different commits with at least one non-.tinkerman/ file, returns fresh: false", () => {
    fc.assert(
      fc.property(
        commitHashArb,
        commitHashArb,
        arrayWithProjectFileArb,
        (reviewedCommit, currentHead, changedFiles) => {
          fc.pre(reviewedCommit !== currentHead);
          const result = checkReviewFreshness(reviewedCommit, currentHead, changedFiles);
          expect(result.fresh).toBe(false);
          expect(result.reason).toContain("project code changed");
          expect(result.changedFiles).toBeDefined();
          // changedFiles should only contain non-.tinkerman/ files
          const nonForge = result.changedFiles as string[];
          for (const f of nonForge) {
            expect(f.startsWith(".tinkerman/")).toBe(false);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
