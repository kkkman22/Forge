/**
 * Tests for `src/glossary/registry.ts` — loadGlossary.
 *
 * Covers:
 *   - Empty enabled packs → empty registry
 *   - Single context glossary → loads correctly
 *   - Multi-context → separate entries
 *   - Custom override → custom wins
 *   - Backward compat → reads .forge/glossary.md as _shared
 *
 * **Validates: R1 Glossary loading, R2 Backward compat, R3 Custom override**
 */

import { describe, expect, it } from "vitest";
import { loadGlossary } from "../../src/glossary/registry.js";
import type { EnabledPacks, FileSystem, PackEntry } from "../../src/pack/types.js";

// ---------------------------------------------------------------------------
// In-memory filesystem
// ---------------------------------------------------------------------------

function createFs(files: Record<string, string>): FileSystem {
  const store = new Map(Object.entries(files));
  return {
    readdir: async (path: string) => {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const names = new Set<string>();
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const parts = rest.split("/");
          if (parts[0]) names.add(parts[0]);
        }
      }
      return [...names];
    },
    readFile: async (path: string) => {
      const content = store.get(path);
      if (content === undefined) throw new Error(`File not found: ${path}`);
      return content;
    },
    writeFile: async (path: string, content: string) => {
      store.set(path, content);
    },
    exists: async (path: string) => {
      if (store.has(path)) return true;
      const prefix = path.endsWith("/") ? path : `${path}/`;
      return [...store.keys()].some((k) => k.startsWith(prefix));
    },
    stat: async (path: string) => {
      if (!store.has(path)) throw new Error(`Not found: ${path}`);
      // Check if it's a directory (has children in store)
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const isDir = [...store.keys()].some((k) => k.startsWith(prefix));
      return {
        isFile: () => !isDir,
        isDirectory: () => isDir,
      };
    },
  };
}

function makePack(name: string, glossaryDir: string): PackEntry {
  return {
    name,
    displayName: name,
    description: "",
    forgeMinVersion: "1.0.0",
    dependsOn: [],
    extends: { glossary: glossaryDir },
    featureFlags: {},
    manifestPath: `/packs/${name}/pack.yaml`,
    rootPath: `/packs/${name}`,
  };
}

function makeEnabledPacks(
  packs: PackEntry[],
  customRoot = "/project/.tinkerman/custom",
): EnabledPacks {
  return {
    order: packs.map((p) => p.name),
    entries: packs,
    customLayerRoot: customRoot,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadGlossary", () => {
  it("returns empty registry for empty enabled packs with no files", async () => {
    const fs = createFs({});
    const enabled = makeEnabledPacks([]);
    const registry = await loadGlossary(enabled, fs);
    expect(registry.entries.size).toBe(0);
    expect(registry.byTerm.size).toBe(0);
  });

  it("loads a single-context glossary correctly", async () => {
    const files: Record<string, string> = {
      "/packs/orders/pack.yaml": "",
      "/packs/orders/glossary/orders.md": [
        "## Order",
        "---",
        "term: Order",
        "updated: 2025-06-01",
        "---",
        "",
        "## 定义",
        "",
        "A customer purchase request.",
        "",
        "## LineItem",
        "---",
        "term: LineItem",
        "aliases: [Item]",
        "updated: 2025-06-01",
        "---",
        "",
        "## 定义",
        "",
        "A single line within an order.",
      ].join("\n"),
    };
    const fs = createFs(files);
    const pack = makePack("orders", "/packs/orders/glossary");
    const enabled = makeEnabledPacks([pack]);
    const registry = await loadGlossary(enabled, fs);

    expect(registry.entries.size).toBe(2);
    expect(registry.entries.get("orders::Order")).toBeDefined();
    expect(registry.entries.get("orders::Order")?.definition).toBe("A customer purchase request.");
    expect(registry.entries.get("orders::LineItem")).toBeDefined();
    expect(registry.entries.get("orders::LineItem")?.aliases).toEqual(["Item"]);

    // byTerm index
    expect(registry.byTerm.get("Order")).toHaveLength(1);
    expect(registry.byTerm.get("LineItem")).toHaveLength(1);
    // Alias index
    expect(registry.byTerm.get("Item")).toHaveLength(1);
  });

  it("loads multi-context entries separately", async () => {
    const files: Record<string, string> = {
      "/packs/orders/glossary/orders.md": [
        "## Order",
        "---",
        "term: Order",
        "updated: 2025-06-01",
        "---",
        "",
        "## 定义",
        "",
        "Purchase order.",
      ].join("\n"),
      "/packs/inventory/glossary/inventory.md": [
        "## SKU",
        "---",
        "term: SKU",
        "updated: 2025-06-01",
        "---",
        "",
        "## 定义",
        "",
        "Stock keeping unit.",
      ].join("\n"),
    };
    const fs = createFs(files);
    const orderPack = makePack("orders", "/packs/orders/glossary");
    const invPack = makePack("inventory", "/packs/inventory/glossary");
    const enabled = makeEnabledPacks([orderPack, invPack]);
    const registry = await loadGlossary(enabled, fs);

    expect(registry.entries.size).toBe(2);
    expect(registry.entries.get("orders::Order")).toBeDefined();
    expect(registry.entries.get("inventory::SKU")).toBeDefined();
    expect(registry.entries.get("orders::Order")?.context).toBe("orders");
    expect(registry.entries.get("inventory::SKU")?.context).toBe("inventory");
  });

  it("custom layer overrides pack layer", async () => {
    const files: Record<string, string> = {
      "/packs/orders/glossary/orders.md": [
        "## Order",
        "---",
        "term: Order",
        "updated: 2025-06-01",
        "---",
        "",
        "## 定义",
        "",
        "Pack definition.",
      ].join("\n"),
      "/project/.tinkerman/custom/glossary/orders.md": [
        "## Order",
        "---",
        "term: Order",
        "updated: 2025-06-02",
        "---",
        "",
        "## 定义",
        "",
        "Custom definition.",
      ].join("\n"),
    };
    const fs = createFs(files);
    const pack = makePack("orders", "/packs/orders/glossary");
    const enabled = makeEnabledPacks([pack]);
    const registry = await loadGlossary(enabled, fs);

    const entry = registry.entries.get("orders::Order");
    expect(entry).toBeDefined();
    expect(entry?.definition).toBe("Custom definition.");
    expect(entry?.sourceLayer).toBe("custom");
  });

  it("reads .forge/glossary.md as _shared for backward compat", async () => {
    const files: Record<string, string> = {
      "/project/.tinkerman/glossary.md": [
        "### Epic",
        "A large body of work.",
        "",
        "### Story",
        "A small increment of value.",
      ].join("\n"),
    };
    const fs = createFs(files);
    const enabled = makeEnabledPacks([]);
    const registry = await loadGlossary(enabled, fs);

    expect(registry.entries.size).toBe(2);
    expect(registry.entries.get("_shared::Epic")).toBeDefined();
    expect(registry.entries.get("_shared::Epic")?.definition).toBe("A large body of work.");
    expect(registry.entries.get("_shared::Story")).toBeDefined();
    expect(registry.entries.get("_shared::Story")?.context).toBe("_shared");
  });

  it("skips packs without glossary extends", async () => {
    const pack: PackEntry = {
      name: "no-glossary",
      displayName: "No Glossary",
      description: "",
      forgeMinVersion: "1.0.0",
      dependsOn: [],
      extends: {},
      featureFlags: {},
      manifestPath: "/packs/no-glossary/pack.yaml",
      rootPath: "/packs/no-glossary",
    };
    const fs = createFs({});
    const enabled = makeEnabledPacks([pack]);
    const registry = await loadGlossary(enabled, fs);

    expect(registry.entries.size).toBe(0);
    expect(registry.byTerm.size).toBe(0);
  });
});
