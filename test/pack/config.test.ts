import { describe, expect, it } from "vitest";
import { parseEnabledPacks } from "../../src/pack/config.js";
import type { PackEntry, PackRegistry } from "../../src/pack/types.js";

function makeRegistry(names: string[]): PackRegistry {
  const packs = new Map<string, PackEntry>();
  for (const name of names) {
    packs.set(name, {
      name,
      displayName: name,
      description: `${name} pack`,
      forgeMinVersion: "2.4.0",
      dependsOn: [],
      extends: {},
      featureFlags: {},
      manifestPath: `/packs/${name}/pack.yaml`,
      rootPath: `/packs/${name}`,
    });
  }
  return { packs, warnings: [] };
}

const CUSTOM_ROOT = "/repos/.tinkerman/custom";

describe("parseEnabledPacks", () => {
  it("returns empty enabled when packs field is absent", () => {
    const config = "---\nproject: Forge\n---\nbody";
    const registry = makeRegistry(["pms"]);
    const result = parseEnabledPacks(config, registry, CUSTOM_ROOT);
    expect(result.enabled.order).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("returns empty enabled when packs is empty list", () => {
    const config = "---\npacks: []\n---\nbody";
    const registry = makeRegistry(["pms"]);
    const result = parseEnabledPacks(config, registry, CUSTOM_ROOT);
    expect(result.enabled.order).toEqual([]);
  });

  it("returns error for unknown pack name", () => {
    const config = "---\npacks:\n  - nonexistent\n---\nbody";
    const registry = makeRegistry(["pms"]);
    const result = parseEnabledPacks(config, registry, CUSTOM_ROOT);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("nonexistent");
  });

  it("deduplicates repeated pack names keeping first", () => {
    const config = "---\npacks:\n  - pms\n  - pms\n---\nbody";
    const registry = makeRegistry(["pms"]);
    const result = parseEnabledPacks(config, registry, CUSTOM_ROOT);
    expect(result.enabled.order).toEqual(["pms"]);
    expect(result.errors).toEqual([]);
  });

  it("enables packs in declaration order", () => {
    const config = "---\npacks:\n  - pms\n  - ecommerce\n---\nbody";
    const registry = makeRegistry(["pms", "ecommerce"]);
    const result = parseEnabledPacks(config, registry, CUSTOM_ROOT);
    expect(result.enabled.order).toEqual(["pms", "ecommerce"]);
    expect(result.enabled.entries).toHaveLength(2);
    expect(result.enabled.customLayerRoot).toBe(CUSTOM_ROOT);
  });

  it("handles config with no frontmatter", () => {
    const config = "just body text, no frontmatter";
    const registry = makeRegistry(["pms"]);
    const result = parseEnabledPacks(config, registry, CUSTOM_ROOT);
    expect(result.enabled.order).toEqual([]);
  });

  it("handles mixed valid and invalid pack names", () => {
    const config = "---\npacks:\n  - pms\n  - bad\n---\nbody";
    const registry = makeRegistry(["pms"]);
    const result = parseEnabledPacks(config, registry, CUSTOM_ROOT);
    expect(result.errors.some((e) => e.includes("bad"))).toBe(true);
    // valid packs should still be enabled despite errors
    expect(result.enabled.order).toEqual(["pms"]);
  });
});
