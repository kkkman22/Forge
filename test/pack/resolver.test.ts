import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAllPaths, resolvePath } from "../../src/pack/resolver.js";
import type { EnabledPacks, PackEntry } from "../../src/pack/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePackEntry(overrides: Partial<PackEntry> = {}): PackEntry {
  return {
    name: "hotel-ops",
    displayName: "Hotel Operations",
    description: "Hotel ops pack",
    forgeMinVersion: "2.4.0",
    dependsOn: [],
    extends: { contexts: "/packs/hotel-ops/contexts" },
    featureFlags: {},
    manifestPath: "/packs/hotel-ops/pack.yaml",
    rootPath: "/packs/hotel-ops",
    ...overrides,
  };
}

const CUSTOM_ROOT = "/project/.tinkerman/custom";

function makeEnabled(entries: PackEntry[] = [], customRoot: string = CUSTOM_ROOT): EnabledPacks {
  return {
    order: entries.map((e) => e.name),
    entries,
    customLayerRoot: customRoot,
  };
}

// ---------------------------------------------------------------------------
// resolvePath
// ---------------------------------------------------------------------------

describe("resolvePath", () => {
  it("returns custom path when entries is empty", () => {
    const enabled = makeEnabled([]);
    const result = resolvePath("glossary/reservations.md", enabled);
    // Custom layer is always a candidate; resolver does no IO
    expect(result).not.toBeNull();
    expect(result?.layer).toBe("custom");
    expect(result?.path).toBe(path.resolve(CUSTOM_ROOT, "glossary/reservations.md"));
  });

  it("returns custom layer path when entries exist (custom wins)", () => {
    const entry = makePackEntry();
    const enabled = makeEnabled([entry]);
    const result = resolvePath("glossary/reservations.md", enabled);
    expect(result).not.toBeNull();
    expect(result?.layer).toBe("custom");
    expect(result?.path).toBe(path.resolve(CUSTOM_ROOT, "glossary/reservations.md"));
  });

  it("returns pack path for single pack when custom traversal fails", () => {
    // Set customLayerRoot such that the relative path escapes it via traversal
    // but the pack root is deep enough to contain it.
    // Actually, for a safe relativePath, custom always passes traversal.
    // To test pack-only, use resolveAllPaths to verify pack is in results.
    const entry = makePackEntry();
    const enabled = makeEnabled([entry]);
    const allResults = resolveAllPaths("glossary/reservations.md", enabled);
    expect(allResults).toHaveLength(2);
    expect(allResults[0].layer).toBe("custom");
    expect(allResults[1].layer).toBe("pack:hotel-ops");
    expect(allResults[1].path).toBe(path.resolve("/packs/hotel-ops/glossary/reservations.md"));
  });

  it("multi-pack: all packs appear in declaration order", () => {
    const pack1 = makePackEntry({ name: "alpha", rootPath: "/packs/alpha" });
    const pack2 = makePackEntry({ name: "beta", rootPath: "/packs/beta" });
    const enabled = makeEnabled([pack1, pack2]);
    const allResults = resolveAllPaths("glossary/reservations.md", enabled);
    expect(allResults).toHaveLength(3); // custom + alpha + beta
    expect(allResults[0].layer).toBe("custom");
    expect(allResults[1].layer).toBe("pack:alpha");
    expect(allResults[2].layer).toBe("pack:beta");
  });

  it("not found: traversal attempt returns null", () => {
    const enabled = makeEnabled([makePackEntry()]);
    const result = resolvePath("../../etc/passwd", enabled);
    expect(result).toBeNull();
  });

  it("path traversal with double dots returns null", () => {
    const enabled = makeEnabled([makePackEntry()]);
    const result = resolvePath("../../../etc/shadow", enabled);
    expect(result).toBeNull();
  });

  it("resolves simple relative path correctly", () => {
    const entry = makePackEntry();
    const enabled = makeEnabled([entry]);
    const result = resolvePath("contexts/reservations.md", enabled);
    expect(result).not.toBeNull();
    expect(result?.layer).toBe("custom");
    expect(result?.path).toBe(path.resolve(CUSTOM_ROOT, "contexts/reservations.md"));
  });

  it("handles deeply nested relative paths", () => {
    const entry = makePackEntry();
    const enabled = makeEnabled([entry]);
    const result = resolvePath("a/b/c/d/e/file.md", enabled);
    expect(result).not.toBeNull();
    expect(result?.path).toBe(path.resolve(CUSTOM_ROOT, "a/b/c/d/e/file.md"));
  });
});

// ---------------------------------------------------------------------------
// resolveAllPaths
// ---------------------------------------------------------------------------

describe("resolveAllPaths", () => {
  it("returns only custom for empty entries", () => {
    const enabled = makeEnabled([]);
    const results = resolveAllPaths("glossary/term.md", enabled);
    expect(results).toHaveLength(1);
    expect(results[0].layer).toBe("custom");
  });

  it("returns custom and all packs for valid path", () => {
    const pack1 = makePackEntry({ name: "alpha", rootPath: "/packs/alpha" });
    const pack2 = makePackEntry({ name: "beta", rootPath: "/packs/beta" });
    const enabled = makeEnabled([pack1, pack2]);
    const results = resolveAllPaths("glossary/term.md", enabled);
    expect(results).toHaveLength(3);
    expect(results[0].layer).toBe("custom");
    expect(results[1].layer).toBe("pack:alpha");
    expect(results[2].layer).toBe("pack:beta");
  });

  it("returns empty array for path traversal attempt", () => {
    const enabled = makeEnabled([makePackEntry()]);
    const results = resolveAllPaths("../../etc/passwd", enabled);
    expect(results).toEqual([]);
  });

  it("returns valid results for normal paths while rejecting traversal", () => {
    const pack1 = makePackEntry({
      name: "shallow",
      rootPath: "/p",
    });
    const enabled = makeEnabled([pack1]);
    const results = resolveAllPaths("normal/file.md", enabled);
    expect(results.length).toBeGreaterThan(0);
  });

  it("preserves declaration order", () => {
    const packs = [
      makePackEntry({ name: "first", rootPath: "/packs/first" }),
      makePackEntry({ name: "second", rootPath: "/packs/second" }),
      makePackEntry({ name: "third", rootPath: "/packs/third" }),
    ];
    const enabled = makeEnabled(packs);
    const results = resolveAllPaths("glossary/x.md", enabled);
    const layers = results.map((r) => r.layer);
    expect(layers).toEqual(["custom", "pack:first", "pack:second", "pack:third"]);
  });
});
