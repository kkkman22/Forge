/**
 * Property tests for `src/glossary/registry.ts` — loadGlossary.
 *
 * Covers:
 *   - Same term in different contexts → no conflict (both exist)
 *
 * **Validates: R1 Multi-context independence**
 */

import { describe, expect, it } from "vitest";
import { loadGlossary } from "../../src/glossary/registry.js";
import type { EnabledPacks, FileSystem, GlossaryEntry, PackEntry } from "../../src/pack/types.js";

// ---------------------------------------------------------------------------
// In-memory filesystem (shared with registry.test.ts logic)
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
    exists: async (path: string) => store.has(path),
    stat: async (path: string) => {
      if (!store.has(path)) throw new Error(`Not found: ${path}`);
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

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe("loadGlossary properties", () => {
  it("same term in different contexts produces no conflict — both entries exist", async () => {
    const files: Record<string, string> = {
      "/packs/orders/glossary/orders.md": [
        "## Product",
        "---",
        "term: Product",
        "updated: 2025-06-01",
        "---",
        "",
        "## 定义",
        "",
        "A product being ordered.",
      ].join("\n"),
      "/packs/catalog/glossary/catalog.md": [
        "## Product",
        "---",
        "term: Product",
        "updated: 2025-06-01",
        "---",
        "",
        "## 定义",
        "",
        "A product in the catalog.",
      ].join("\n"),
    };
    const fs = createFs(files);
    const orderPack = makePack("orders", "/packs/orders/glossary");
    const catalogPack = makePack("catalog", "/packs/catalog/glossary");
    const enabled: EnabledPacks = {
      order: [orderPack, catalogPack].map((p) => p.name),
      entries: [orderPack, catalogPack],
      customLayerRoot: "/project/.tinkerman/custom",
    };

    const registry = await loadGlossary(enabled, fs);

    // Both entries should exist with distinct keys
    expect(registry.entries.get("orders::Product")).toBeDefined();
    expect(registry.entries.get("catalog::Product")).toBeDefined();
    expect(registry.entries.get("orders::Product")?.definition).toBe("A product being ordered.");
    expect(registry.entries.get("catalog::Product")?.definition).toBe("A product in the catalog.");

    // byTerm should list both under "Product"
    const byProduct = registry.byTerm.get("Product");
    expect(byProduct).toHaveLength(2);
    expect(byProduct?.map((e: GlossaryEntry) => e.context).sort()).toEqual(["catalog", "orders"]);
  });
});
