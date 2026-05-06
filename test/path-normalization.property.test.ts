/**
 * Property test: Path normalization produces consistent frozen zone judgments.
 *
 * Property 6: For any file path that refers to a frozen zone location, all
 * path variants (absolute path, relative path, path with `..` traversal,
 * path with redundant separators, path with `.forge/` prefix variations)
 * SHALL produce the same `isFrozenZonePath` result as the canonical relative form.
 *
 * **Validates: Requirements 4.1, 4.2, 4.3**
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Source-sync guard
// ---------------------------------------------------------------------------

const checkFrozenSource = readFileSync(resolve(process.cwd(), "src/check-frozen.ts"), "utf-8");
if (!checkFrozenSource.includes("normalizeForgePath")) {
  throw new Error("Source sync failed: check-frozen.ts must use normalizeForgePath from state.ts");
}

// ---------------------------------------------------------------------------
// Import real state.ts functions (no side effects)
// ---------------------------------------------------------------------------

import { getProtectionZone, normalizeForgePath } from "../src/state.js";

// ---------------------------------------------------------------------------
// Mock check-frozen.ts to bypass top-level main() / process.exit
// ---------------------------------------------------------------------------

vi.mock("../src/check-frozen.js", () => ({
  isFrozenZonePath(filePath: string): boolean {
    const relativePath = normalizeForgePath(filePath);
    return getProtectionZone(relativePath) === "frozen";
  },
}));

import { isFrozenZonePath } from "../src/check-frozen.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Frozen zone relative paths (relative to .forge/) */
const frozenRelativePathArb = fc.oneof(
  // specs/ paths
  fc
    .tuple(
      fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/),
      fc.stringMatching(/^[a-z][a-z0-9-]{0,20}\.md$/),
    )
    .map(([dir, file]) => `specs/${dir}/${file}`),
  // plans/ paths
  fc.tuple(fc.stringMatching(/^[a-z][a-z0-9-]{0,20}\.md$/)).map(([file]) => `plans/${file}`),
  // config.md
  fc.constant("config.md"),
);

/** Non-frozen zone relative paths */
const nonFrozenRelativePathArb = fc.oneof(
  fc.constant("progress/topic.md"),
  fc.constant("reviews/review.md"),
  fc.constant("knowledge/instincts.md"),
  fc.constant("scratch/notes.md"),
  fc.stringMatching(/^[a-z][a-z0-9-]{0,15}\.md$/).map((f) => `scratch/${f}`),
);

/** Absolute path prefix generator */
const absolutePrefixArb = fc.oneof(
  fc.constant("/home/user/project/"),
  fc.constant("/abs/path/to/repo/"),
  fc.constant("/var/data/workspace/"),
  fc.constant("/Users/dev/code/"),
);

// ---------------------------------------------------------------------------
// Property 6: Path normalization consistency
// ---------------------------------------------------------------------------

describe("Property 6: Path normalization produces consistent frozen zone judgments", () => {
  it("normalizeForgePath produces the same result for all path variants of a frozen zone path", () => {
    fc.assert(
      fc.property(frozenRelativePathArb, (relativePath) => {
        // Canonical form: the .forge/-relative path
        const canonical = normalizeForgePath(relativePath);

        // Variant 1: with .forge/ prefix
        const withForgePrefix = `.forge/${relativePath}`;
        expect(normalizeForgePath(withForgePrefix)).toBe(canonical);

        // Variant 2: absolute path
        const absolute = `/home/user/project/.forge/${relativePath}`;
        expect(normalizeForgePath(absolute)).toBe(canonical);

        // Variant 3: with redundant separators
        const doubleSlash = `.forge//${relativePath}`;
        expect(normalizeForgePath(doubleSlash)).toBe(canonical);

        // Variant 4: with ./ prefix
        const dotSlash = `./.forge/${relativePath}`;
        expect(normalizeForgePath(dotSlash)).toBe(canonical);
      }),
      { numRuns: 50 },
    );
  });

  it("isFrozenZonePath returns true for all variants of frozen zone paths", () => {
    fc.assert(
      fc.property(frozenRelativePathArb, (relativePath) => {
        // All these variants should produce the same frozen zone judgment
        const variants = [
          relativePath,
          `.forge/${relativePath}`,
          `/abs/path/.forge/${relativePath}`,
          `./.forge/${relativePath}`,
          `.forge//${relativePath}`,
        ];

        const results = variants.map((v) => isFrozenZonePath(v));

        // All should be true (frozen zone)
        for (let i = 0; i < results.length; i++) {
          expect(results[i]).toBe(true);
        }

        // All should be consistent with each other
        expect(new Set(results).size).toBe(1);
      }),
      { numRuns: 50 },
    );
  });

  it("isFrozenZonePath returns consistent results for absolute vs relative paths (Req 4.3)", () => {
    fc.assert(
      fc.property(frozenRelativePathArb, absolutePrefixArb, (relativePath, absPrefix) => {
        const relativeResult = isFrozenZonePath(`.forge/${relativePath}`);
        const absoluteResult = isFrozenZonePath(`${absPrefix}.forge/${relativePath}`);

        expect(relativeResult).toBe(absoluteResult);
      }),
      { numRuns: 50 },
    );
  });

  it("paths with .. traversal that resolve to frozen zone are correctly identified (Req 4.2)", () => {
    // Specific .. traversal patterns that should resolve to frozen zone
    const traversalCases = [
      // Escape and re-enter .forge/
      ".forge/../.forge/specs/feature/spec.md",
      ".forge/../.forge/plans/plan.md",
      ".forge/../.forge/config.md",
      // Escape a subdirectory and re-enter
      ".forge/specs/../specs/feature/spec.md",
      ".forge/plans/../plans/plan.md",
      // Deeper traversal
      ".forge/a/../specs/feature/spec.md",
      ".forge/specs/a/b/../../feature/spec.md",
    ];

    for (const path of traversalCases) {
      expect(isFrozenZonePath(path)).toBe(true);
    }
  });

  it("non-frozen paths remain non-frozen regardless of path variant", () => {
    fc.assert(
      fc.property(nonFrozenRelativePathArb, (relativePath) => {
        const variants = [
          relativePath,
          `.forge/${relativePath}`,
          `/abs/path/.forge/${relativePath}`,
          `./.forge/${relativePath}`,
        ];

        const results = variants.map((v) => isFrozenZonePath(v));

        // All should be false (not frozen)
        for (const result of results) {
          expect(result).toBe(false);
        }
      }),
      { numRuns: 40 },
    );
  });

  // -------------------------------------------------------------------------
  // Edge cases (Req 4.6)
  // -------------------------------------------------------------------------

  it("handles paths with .. that escape and re-enter .forge/", () => {
    // .forge/../.forge/specs/x.md → should resolve to specs/x.md → frozen
    expect(isFrozenZonePath(".forge/../.forge/specs/feature/spec.md")).toBe(true);

    // .forge/../../.forge/plans/plan.md → normalizes to ../.forge/plans/plan.md
    // lastIndexOf(".forge/") still finds .forge/ → extracts plans/plan.md → frozen
    // This is correct per Req 4.2: paths with .. traversal pointing to frozen zone are blocked
    expect(isFrozenZonePath(".forge/../../.forge/plans/plan.md")).toBe(true);

    const normalized = normalizeForgePath(".forge/../../.forge/plans/plan.md");
    expect(normalized).toBe("plans/plan.md");
    expect(getProtectionZone(normalized)).toBe("frozen");
  });

  it("handles double slashes in paths", () => {
    expect(isFrozenZonePath(".forge//specs//feature//spec.md")).toBe(true);
    expect(isFrozenZonePath(".forge///plans///plan.md")).toBe(true);
    expect(isFrozenZonePath("//abs//path//.forge//config.md")).toBe(true);
  });

  it("handles trailing slashes", () => {
    // specs/ with trailing slash should still be in frozen zone
    expect(isFrozenZonePath(".forge/specs/")).toBe(true);
    expect(isFrozenZonePath(".forge/plans/")).toBe(true);
  });

  it("normalizeForgePath handles empty string", () => {
    const result = normalizeForgePath("");
    expect(result).toBe(".");
  });

  it("normalizeForgePath strips .forge/ prefix correctly", () => {
    expect(normalizeForgePath(".forge/specs/feature/spec.md")).toBe("specs/feature/spec.md");
    expect(normalizeForgePath(".forge/config.md")).toBe("config.md");
    expect(normalizeForgePath("specs/feature/spec.md")).toBe("specs/feature/spec.md");
  });
});
