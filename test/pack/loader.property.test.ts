/**
 * Property test: pack loader invariants.
 *
 * Invariants tested:
 *   - Idempotence: same inputs produce identical registries (serialized to JSON).
 *   - No crash: random YAML content never throws, only produces warnings.
 *   - Empty input stability: empty or missing packs directory returns empty registry.
 *
 * Uses fast-check for PBT and vitest for test runner.
 *
 * **Validates: R1.1–R1.6 Pack discovery and manifest parsing**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { loadPackRegistry, validateManifest } from "../../src/pack/loader.js";
import type { FileSystem } from "../../src/pack/types.js";
import path from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPOS_ROOT = "/repos";
const PACKS_DIR = path.join(REPOS_ROOT, "packs");

/** Build a mock FileSystem backed by a simple file map. */
function createMockFs(files: Record<string, string | null>): FileSystem {
  return {
    readdir: async (dir: string) => {
      const dirPrefix = dir.endsWith("/") ? dir : dir + "/";
      const entries = new Set<string>();
      for (const f of Object.keys(files)) {
        if (f.startsWith(dirPrefix)) {
          const rest = f.slice(dirPrefix.length);
          const firstSegment = rest.split("/")[0];
          if (firstSegment) entries.add(firstSegment);
        }
      }
      return [...entries];
    },
    readFile: async (f: string) => {
      const content = files[f];
      if (content === undefined || content === null) throw new Error(`ENOENT: ${f}`);
      return content;
    },
    writeFile: async () => {},
    exists: async (f: string) => f in files && files[f] !== null,
    stat: async () => ({ isFile: () => true, isDirectory: () => false }),
  };
}

/** Serialize a PackRegistry to a comparable JSON string (Maps → arrays). */
function serializeRegistry(registry: Awaited<ReturnType<typeof loadPackRegistry>>): string {
  return JSON.stringify(registry, (_, v) => (v instanceof Map ? [...v.entries()].sort() : v));
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Arbitrary valid kebab-case name. */
const kebabArb = fc
  .tuple(
    fc.constantFrom("a", "b", "c", "demo", "pack", "core", "my", "test"),
    fc.option(fc.constantFrom("svc", "lib", "mod", "ext", "base"), { nil: undefined }),
  )
  .map(([prefix, suffix]) => (suffix ? `${prefix}-${suffix}` : prefix));

/** Arbitrary valid YAML manifest content. */
const validManifestArb = fc.record({
  name: kebabArb,
  display_name: fc.string({ minLength: 1, maxLength: 40 }),
  description: fc.string({ minLength: 1, maxLength: 100 }),
  forge_min_version: fc.tuple(fc.nat({ max: 9 }), fc.nat({ max: 20 }), fc.nat({ max: 99 })).map(([a, b, c]) => `${a}.${b}.${c}`),
  extends: fc.constant("{}"),
});

type ManifestRecord = {
  name: string;
  display_name: string;
  description: string;
  forge_min_version: string;
  extends: string;
};

/** Build a minimal valid YAML string from a generated manifest. */
function manifestToYaml(m: ManifestRecord): string {
  return [
    `name: ${m.name}`,
    `display_name: "${m.display_name.replace(/"/g, '\\"')}"`,
    `description: "${m.description.replace(/"/g, '\\"')}"`,
    `forge_min_version: "${m.forge_min_version}"`,
    "extends: {}",
  ].join("\n");
}

/** Arbitrary that generates a file map with 0–5 valid packs. */
const validPacksFileMapArb = fc.array(validManifestArb, { minLength: 0, maxLength: 5 }).map((manifests) => {
  const files: Record<string, string> = {};
  for (const m of manifests) {
    const dir = m.name;
    files[path.join(PACKS_DIR, dir, "pack.yaml")] = manifestToYaml(m);
  }
  return files;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadPackRegistry property: idempotence", () => {
  it("same inputs always produce identical registries (serialized to JSON)", async () => {
    await fc.assert(
      fc.asyncProperty(validPacksFileMapArb, async (files) => {
        const fs1 = createMockFs(files);
        const fs2 = createMockFs(files);

        const registry1 = await loadPackRegistry(REPOS_ROOT, fs1);
        const registry2 = await loadPackRegistry(REPOS_ROOT, fs2);

        expect(serializeRegistry(registry1)).toBe(serializeRegistry(registry2));
      }),
      { numRuns: 200 },
    );
  });
});

describe("loadPackRegistry property: no crash", () => {
  it("random string YAML content never throws, only produces warnings", async () => {
    const randomYamlArb = fc.record({
      dirName: fc.string({ minLength: 1, maxLength: 20 }).map((s) => s.replace(/[/\\]/g, "_")),
      content: fc.string({ minLength: 0, maxLength: 500 }),
    });

    await fc.assert(
      fc.asyncProperty(fc.array(randomYamlArb, { minLength: 0, maxLength: 5 }), async (entries) => {
        const files: Record<string, string> = {};
        for (const e of entries) {
          files[path.join(PACKS_DIR, e.dirName, "pack.yaml")] = e.content;
        }
        const fs = createMockFs(files);

        const registry = await loadPackRegistry(REPOS_ROOT, fs);

        // Must return a valid registry structure, never throw
        expect(registry).toBeDefined();
        expect(Array.isArray(registry.warnings)).toBe(true);
        // packs is a Map
        expect(registry.packs).toBeInstanceOf(Map);
      }),
      { numRuns: 300 },
    );
  });
});

describe("loadPackRegistry property: empty input stability", () => {
  it("empty packs directory returns empty registry with no warnings", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(undefined), async () => {
        const fs = createMockFs({});
        const registry = await loadPackRegistry(REPOS_ROOT, fs);

        expect(registry.packs.size).toBe(0);
        expect(registry.warnings).toEqual([]);
      }),
      { numRuns: 50 },
    );
  });

  it("missing packs directory (readdir throws) returns empty registry with no warnings", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(undefined), async () => {
        const fs: FileSystem = {
          readdir: async () => { throw new Error("ENOENT"); },
          readFile: async () => { throw new Error("ENOENT"); },
          writeFile: async () => {},
          exists: async () => false,
          stat: async () => { throw new Error("ENOENT"); },
        };

        const registry = await loadPackRegistry(REPOS_ROOT, fs);

        expect(registry.packs.size).toBe(0);
        expect(registry.warnings).toEqual([]);
      }),
      { numRuns: 50 },
    );
  });

  it("packs directory with subdirs but no pack.yaml returns empty registry", async () => {
    const dirNamesArb = fc.array(fc.string({ minLength: 1, maxLength: 20 }).map((s) => s.replace(/[/\\]/g, "_")), {
      minLength: 0,
      maxLength: 10,
    });

    await fc.assert(
      fc.asyncProperty(dirNamesArb, async (dirNames) => {
        // Create empty dirs by adding a non-pack.yaml file in each
        const files: Record<string, string> = {};
        for (const dir of dirNames) {
          files[path.join(PACKS_DIR, dir, "readme.md")] = "not a pack";
        }
        const fs = createMockFs(files);

        const registry = await loadPackRegistry(REPOS_ROOT, fs);

        expect(registry.packs.size).toBe(0);
        expect(registry.warnings).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});

describe("validateManifest property", () => {
  it("never throws for any arbitrary object input", () => {
    const arbitraryObjArb = fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.anything(),
    );

    fc.assert(
      fc.property(arbitraryObjArb, (obj) => {
        expect(() => validateManifest(obj)).not.toThrow();
        const errors = validateManifest(obj);
        expect(Array.isArray(errors)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
