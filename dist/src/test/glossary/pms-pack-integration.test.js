import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadGlossary } from "../../src/glossary/registry.js";
const PMS_PACK_ROOT = resolve(__dirname, "../../packs/pms");
const GLOSSARY_DIR = resolve(PMS_PACK_ROOT, "glossary");
// Skip if PMS Pack not present
const pmsPackAvailable = existsSync(GLOSSARY_DIR);
describe.skipIf(!pmsPackAvailable)("Glossary loader against real PMS Pack", () => {
    function createRealFs() {
        return {
            exists: (p) => Promise.resolve(existsSync(p)),
            readFile: (p) => Promise.resolve(readFileSync(p, "utf-8")),
            readdir: (p) => {
                try {
                    return Promise.resolve(readdirSync(p));
                }
                catch {
                    return Promise.resolve([]);
                }
            },
            writeFile: () => Promise.resolve(),
            stat: () => Promise.reject(new Error("not implemented")),
        };
    }
    function pmsEnabledPacks() {
        const entry = {
            name: "pms",
            displayName: "Hotel PMS Domain Pack",
            description: "PMS domain pack",
            forgeMinVersion: "2.4.0",
            dependsOn: [],
            rootPath: PMS_PACK_ROOT,
            manifestPath: resolve(PMS_PACK_ROOT, "pack.yaml"),
            extends: {
                glossary: GLOSSARY_DIR,
                contexts: resolve(PMS_PACK_ROOT, "contexts"),
                scenarios: resolve(PMS_PACK_ROOT, "scenarios"),
                bannedPatterns: resolve(PMS_PACK_ROOT, "banned-patterns.yaml"),
                stateMachines: resolve(PMS_PACK_ROOT, "state-machines"),
                lintRules: resolve(PMS_PACK_ROOT, "lint-rules"),
            },
            featureFlags: {},
        };
        return {
            order: ["pms"],
            entries: [entry],
            customLayerRoot: "/custom",
        };
    }
    it("loads aggregated-format glossary files with ≥80 entries", async () => {
        const registry = await loadGlossary(pmsEnabledPacks(), createRealFs());
        // Debug: if this fails, check that PMS glossary files use aggregated format
        expect(registry.entries.size).toBeGreaterThanOrEqual(80);
    });
    it("Room defined in at least 2 contexts", async () => {
        const registry = await loadGlossary(pmsEnabledPacks(), createRealFs());
        const roomEntries = registry.byTerm.get("Room") ?? [];
        const contexts = new Set(roomEntries.map((e) => e.context));
        expect(contexts.size).toBeGreaterThanOrEqual(2);
    });
    it("Guest defined in at least 1 context", async () => {
        const registry = await loadGlossary(pmsEnabledPacks(), createRealFs());
        const guestEntries = registry.byTerm.get("Guest") ?? [];
        expect(guestEntries.length).toBeGreaterThanOrEqual(1);
    });
});
//# sourceMappingURL=pms-pack-integration.test.js.map