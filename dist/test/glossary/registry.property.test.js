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
// ---------------------------------------------------------------------------
// In-memory filesystem (shared with registry.test.ts logic)
// ---------------------------------------------------------------------------
function createFs(files) {
    const store = new Map(Object.entries(files));
    return {
        readdir: async (path) => {
            const prefix = path.endsWith("/") ? path : `${path}/`;
            const names = new Set();
            for (const key of store.keys()) {
                if (key.startsWith(prefix)) {
                    const rest = key.slice(prefix.length);
                    const parts = rest.split("/");
                    if (parts[0])
                        names.add(parts[0]);
                }
            }
            return [...names];
        },
        readFile: async (path) => {
            const content = store.get(path);
            if (content === undefined)
                throw new Error(`File not found: ${path}`);
            return content;
        },
        writeFile: async (path, content) => {
            store.set(path, content);
        },
        exists: async (path) => store.has(path),
        stat: async (path) => {
            if (!store.has(path))
                throw new Error(`Not found: ${path}`);
            const prefix = path.endsWith("/") ? path : `${path}/`;
            const isDir = [...store.keys()].some((k) => k.startsWith(prefix));
            return {
                isFile: () => !isDir,
                isDirectory: () => isDir,
            };
        },
    };
}
function makePack(name, glossaryDir) {
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
        const files = {
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
        const enabled = {
            order: [orderPack, catalogPack].map((p) => p.name),
            entries: [orderPack, catalogPack],
            customLayerRoot: "/project/.forge/custom",
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
        expect(byProduct?.map((e) => e.context).sort()).toEqual(["catalog", "orders"]);
    });
});
//# sourceMappingURL=registry.property.test.js.map