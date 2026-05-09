/**
 * Zero-Pack-Zero-Impact invariant regression tests.
 *
 * When no packs are enabled, all pack subsystems must return empty results
 * and no behavior should change from pre-pack Forge.
 *
 * **Validates**: R12 Zero-Pack-Zero-Impact invariant
 */

import { describe, expect, it } from "vitest";
import { loadPackRegistry } from "../../src/pack/loader.js";
import { parseEnabledPacks } from "../../src/pack/config.js";
import { resolvePath, resolveAllPaths } from "../../src/pack/resolver.js";
import { loadContexts } from "../../src/context/registry.js";
import { loadContextMap } from "../../src/context/map.js";
import { loadGlossary } from "../../src/glossary/registry.js";
import { loadBannedPatterns } from "../../src/spec-leak-detector.js";
import type { EnabledPacks, FileSystem } from "../../src/pack/types.js";

const emptyFs: FileSystem = {
  readdir: async () => [],
  readFile: async () => { throw new Error("no files"); },
  writeFile: async () => {},
  exists: async () => false,
  stat: async () => ({ isFile: () => false, isDirectory: () => false }),
};

const emptyEnabled: EnabledPacks = {
  order: [],
  entries: [],
  customLayerRoot: "/project/.forge/custom",
};

describe("Zero-Pack-Zero-Impact invariant", () => {
  it("loadPackRegistry returns empty registry when no packs directory", async () => {
    const registry = await loadPackRegistry("/nonexistent", emptyFs);
    expect(registry.packs.size).toBe(0);
    expect(registry.warnings).toEqual([]);
  });

  it("parseEnabledPacks returns empty with no packs config", () => {
    const result = parseEnabledPacks("", { packs: new Map(), warnings: [] }, "/custom");
    expect(result.enabled.order).toEqual([]);
    expect(result.enabled.entries).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("resolvePath resolves only to custom layer (no pack layers)", () => {
    const result = resolvePath("glossary/orders.md", emptyEnabled);
    // Custom layer always exists as fallback — but no pack layers
    expect(result).not.toBeNull();
    expect(result!.layer).toBe("custom");
  });

  it("resolveAllPaths returns only custom layer for empty enabled packs", () => {
    const results = resolveAllPaths("glossary/orders.md", emptyEnabled);
    expect(results).toHaveLength(1);
    expect(results[0].layer).toBe("custom");
  });

  it("loadContexts returns empty registry for empty enabled packs", async () => {
    const registry = await loadContexts(emptyEnabled, emptyFs);
    expect(registry.contexts.size).toBe(0);
    expect(registry.map).toEqual([]);
  });

  it("loadContextMap returns empty for empty enabled packs", async () => {
    const map = await loadContextMap(emptyEnabled, emptyFs);
    expect(map).toEqual([]);
  });

  it("loadGlossary returns empty registry for empty enabled packs", async () => {
    const registry = await loadGlossary(emptyEnabled, emptyFs);
    expect(registry.entries.size).toBe(0);
    expect(registry.byTerm.size).toBe(0);
  });

  it("loadBannedPatterns returns empty registry for empty enabled packs", async () => {
    const registry = await loadBannedPatterns(emptyEnabled, emptyFs);
    expect(registry.categories.size).toBe(0);
  });
});
