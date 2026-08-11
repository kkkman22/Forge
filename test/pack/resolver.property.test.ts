/**
 * Property-based tests for the pack resolver.
 *
 * Uses fast-check to verify invariants that hold across many random inputs.
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveAllPaths, resolvePath } from "../../src/pack/resolver.js";
import type { EnabledPacks, PackEntry } from "../../src/pack/types.js";

// ---------------------------------------------------------------------------
// Arbitrary generators
// ---------------------------------------------------------------------------

/** Generate a unique kebab-case pack name. */
const arbPackName = fc
  .tuple(
    fc.constantFrom("a", "b", "alpha", "beta", "demo", "hotel", "core", "pms"),
    fc.constantFrom("ops", "svc", "lib", "ext", "base"),
  )
  .map(([a, b]) => `${a}-${b}`);

/** Generate a safe relative path segment (no traversal). */
const arbSafeSegment = fc
  .string({ minLength: 1, maxLength: 12 })
  .filter((s) => /^[a-z0-9_-]+$/.test(s));

const arbSafeRelativePath = fc
  .array(arbSafeSegment, { minLength: 1, maxLength: 4 })
  .map((segments) => `${segments.join("/")}.md`);

/**
 * Generate a unique-name pack entry.
 * Uses fc.uniqueArray to guarantee no duplicate names.
 */
const arbUniquePackEntries = fc
  .uniqueArray(
    fc.record({
      name: arbPackName,
      rootPath: fc.constantFrom("aa", "ab", "bb", "cd", "ef", "gh").map((s) => `/packs/${s}`),
    }),
    {
      minLength: 0,
      maxLength: 5,
      selector: (p) => p.name,
    },
  )
  .map((packs): EnabledPacks => {
    const entries: PackEntry[] = packs.map((p) => ({
      name: p.name,
      displayName: p.name,
      description: "",
      forgeMinVersion: "2.4.0",
      dependsOn: [],
      extends: {},
      featureFlags: {},
      manifestPath: `${p.rootPath}/pack.yaml`,
      rootPath: p.rootPath,
    }));
    return {
      order: packs.map((p) => p.name),
      entries,
      customLayerRoot: "/project/.tinkerman/custom",
    };
  });

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("resolvePath properties", () => {
  it("empty enabled always returns exactly custom", () => {
    const empty: EnabledPacks = {
      order: [],
      entries: [],
      customLayerRoot: "/project/.tinkerman/custom",
    };
    // With empty entries, custom is the only candidate
    const results = resolveAllPaths("any/path.md", empty);
    expect(results).toHaveLength(1);
    expect(results[0].layer).toBe("custom");
  });

  it("custom always wins over pack for any safe path", () => {
    fc.assert(
      fc.property(arbSafeRelativePath, arbUniquePackEntries, (relPath, enabled) => {
        if (enabled.entries.length === 0) return; // need at least one pack to compare
        const result = resolvePath(relPath, enabled);
        expect(result).not.toBeNull();
        expect(result?.layer).toBe("custom");
      }),
    );
  });

  it("resolution order is idempotent: same input produces same output", () => {
    fc.assert(
      fc.property(arbSafeRelativePath, arbUniquePackEntries, (relPath, enabled) => {
        const first = resolvePath(relPath, enabled);
        const second = resolvePath(relPath, enabled);
        expect(first).toEqual(second);

        const allFirst = resolveAllPaths(relPath, enabled);
        const allSecond = resolveAllPaths(relPath, enabled);
        expect(allFirst).toEqual(allSecond);
      }),
    );
  });

  it("resolveAllPaths length is always 1 + entries.length for safe paths", () => {
    fc.assert(
      fc.property(arbSafeRelativePath, arbUniquePackEntries, (relPath, enabled) => {
        const results = resolveAllPaths(relPath, enabled);
        expect(results).toHaveLength(1 + enabled.entries.length);
      }),
    );
  });

  it("path traversal attempt always returns null (Unix-style)", () => {
    const traversalPaths = ["../../etc/passwd", "../../../etc/shadow", "../secret", "a/../../../b"];
    fc.assert(
      fc.property(
        fc.constantFrom(...traversalPaths),
        arbUniquePackEntries,
        (traversalPath, enabled) => {
          const result = resolvePath(traversalPath, enabled);
          expect(result).toBeNull();

          const allResults = resolveAllPaths(traversalPath, enabled);
          expect(allResults).toEqual([]);
        },
      ),
    );
  });

  it("resolveAllPaths layers always start with custom followed by packs in order", () => {
    fc.assert(
      fc.property(arbSafeRelativePath, arbUniquePackEntries, (relPath, enabled) => {
        const results = resolveAllPaths(relPath, enabled);
        if (results.length === 0) return;

        const layers = results.map((r) => r.layer);
        expect(layers[0]).toBe("custom");
        for (let i = 1; i < layers.length; i++) {
          expect(layers[i]).toBe(`pack:${enabled.entries[i - 1].name}`);
        }
      }),
    );
  });
});
