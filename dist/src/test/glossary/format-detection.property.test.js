import { describe, expect, it } from "vitest";
import { loadGlossary } from "../../src/glossary/registry.js";
function createMockFs(files) {
    return {
        exists: (p) => Promise.resolve(p in files),
        readFile: (p) => {
            if (!(p in files))
                return Promise.reject(new Error(`Not found: ${p}`));
            return Promise.resolve(files[p]);
        },
        readdir: (p) => {
            const prefix = p.endsWith("/") ? p : `${p}/`;
            const names = new Set();
            for (const path of Object.keys(files)) {
                if (path.startsWith(prefix)) {
                    const rest = path.slice(prefix.length);
                    const name = rest.split("/")[0];
                    if (name)
                        names.add(name);
                }
            }
            return Promise.resolve([...names]);
        },
        writeFile: () => Promise.resolve(),
        stat: () => Promise.reject(new Error("not implemented")),
    };
}
function packGlossary(content) {
    const files = {
        "/pack/glossary/test.md": content,
    };
    const entry = {
        name: "test-pack",
        displayName: "Test Pack",
        description: "test",
        forgeMinVersion: "2.4.0",
        dependsOn: [],
        rootPath: "/pack",
        manifestPath: "/pack/pack.yaml",
        extends: {
            glossary: "/pack/glossary",
            contexts: "/pack/contexts",
            scenarios: "/pack/scenarios",
            bannedPatterns: "/pack/banned-patterns.yaml",
            stateMachines: "/pack/state-machines",
            lintRules: "/pack/lint-rules",
        },
        featureFlags: {},
    };
    return {
        packs: {
            order: ["test-pack"],
            entries: [entry],
            customLayerRoot: "/custom",
        },
        fs: createMockFs(files),
    };
}
describe("Format detection properties", () => {
    it("aggregated format with non-empty terms array produces entries", async () => {
        const { packs, fs } = packGlossary(`---
name: test
terms:
  - term: Foo
    aliases: []
    definition: "bar"
---`);
        const registry = await loadGlossary(packs, fs);
        expect(registry.entries.size).toBeGreaterThan(0);
        expect(registry.byTerm.has("Foo")).toBe(true);
    });
    it("per-term format with frontmatter containing 'term' produces entries", async () => {
        const { packs, fs } = packGlossary(`## FooTerm
---
term: FooTerm
aliases: []
updated: 2026-01-01
source: test
---
## 定义
A definition`);
        const registry = await loadGlossary(packs, fs);
        expect(registry.entries.size).toBeGreaterThan(0);
    });
    it("frontmatter with neither terms array nor term string produces no entries", async () => {
        const { packs, fs } = packGlossary(`---
name: test
description: "no terms"
---`);
        const registry = await loadGlossary(packs, fs);
        expect(registry.entries.size).toBe(0);
    });
    it("aggregated format takes priority when both fields present", async () => {
        const { packs, fs } = packGlossary(`---
name: test
terms:
  - term: AggTerm
    aliases: []
    definition: "from aggregated"
---
## PerTermSection
---
term: PerTerm
aliases: []
updated: 2026-01-01
---
## 定义
from per-term`);
        const registry = await loadGlossary(packs, fs);
        // Aggregated format takes priority — only AggTerm should appear
        expect(registry.byTerm.has("AggTerm")).toBe(true);
        expect(registry.byTerm.has("PerTerm")).toBe(false);
    });
});
//# sourceMappingURL=format-detection.property.test.js.map