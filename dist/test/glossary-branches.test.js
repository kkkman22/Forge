import { describe, expect, it } from "vitest";
import { archiveTerm, detectConflict, findStaleterms, findTerm, mergeTerm, parseGlossary, renderGlossary, } from "../src/glossary.js";
function term(overrides = {}) {
    return {
        term: "API",
        definition: "Application Programming Interface",
        aliases: ["application programming interface"],
        last_updated: "2026-01-01",
        ...overrides,
    };
}
function glossary(terms = []) {
    return { schema_version: 1, updated: "", terms };
}
describe("findTerm (branch coverage)", () => {
    it("returns null for empty query", () => {
        expect(findTerm(glossary([term()]), "")).toBeNull();
        expect(findTerm(glossary([term()]), "   ")).toBeNull();
    });
    it("matches canonical term case-insensitively", () => {
        expect(findTerm(glossary([term()]), "api")?.term).toBe("API");
        expect(findTerm(glossary([term()]), "API")?.term).toBe("API");
    });
    it("matches via aliases", () => {
        expect(findTerm(glossary([term()]), "application programming interface")?.term).toBe("API");
    });
    it("returns null when no match", () => {
        expect(findTerm(glossary([term()]), "nonexistent")).toBeNull();
    });
    it("returns null for empty glossary", () => {
        expect(findTerm(glossary([]), "api")).toBeNull();
    });
    it("skips alias loop when aliases undefined", () => {
        const t = term({ aliases: undefined });
        // canonical match still works
        expect(findTerm(glossary([t]), "api")?.term).toBe("API");
        // but an alias-only query won't match
        expect(findTerm(glossary([t]), "application programming interface")).toBeNull();
    });
});
describe("detectConflict (branch coverage)", () => {
    it("reports same_term_different_definition when name matches but definition differs", () => {
        const existing = term({ term: "API", definition: "Original" });
        const candidate = term({ term: "API", definition: "Different" });
        const r = detectConflict(glossary([existing]), candidate);
        expect(r.hasConflict).toBe(true);
        expect(r.reason).toBe("same_term_different_definition");
    });
    it("reports no conflict when same name + same definition (no-op extension)", () => {
        const existing = term({ term: "API", definition: "Same" });
        const candidate = term({ term: "API", definition: "Same" });
        const r = detectConflict(glossary([existing]), candidate);
        expect(r.hasConflict).toBe(false);
    });
    it("reports same_alias_different_term when a candidate alias collides with another term's canonical name", () => {
        const existing = term({ term: "REST", definition: "REST API", aliases: [] });
        const candidate = term({ term: "HTTP", definition: "HyperText", aliases: ["REST"] });
        const r = detectConflict(glossary([existing]), candidate);
        expect(r.hasConflict).toBe(true);
        expect(r.reason).toBe("same_alias_different_term");
    });
    it("reports no conflict for a brand-new term with unique aliases", () => {
        const existing = term({ term: "API", definition: "App", aliases: ["app-iface"] });
        const candidate = term({ term: "SDK", definition: "Dev kit", aliases: ["dev-kit"] });
        const r = detectConflict(glossary([existing]), candidate);
        expect(r.hasConflict).toBe(false);
    });
    it("candidate with empty-string aliases skips them (no false conflict)", () => {
        const existing = term({ term: "API", definition: "x", aliases: [] });
        const candidate = term({ term: "New", definition: "y", aliases: ["", "  "] });
        const r = detectConflict(glossary([existing]), candidate);
        expect(r.hasConflict).toBe(false);
    });
    it("candidate with undefined aliases skips the alias loop entirely", () => {
        const existing = term({ term: "API", definition: "x", aliases: undefined });
        const candidate = term({ term: "New", definition: "y", aliases: undefined });
        const r = detectConflict(glossary([existing]), candidate);
        expect(r.hasConflict).toBe(false);
    });
});
describe("mergeTerm + archiveTerm + findStaleterms (branch coverage)", () => {
    it("mergeTerm add_alias strategy merges aliases into existing term without duplicates", () => {
        const target = term({ term: "API", aliases: ["app-iface"] });
        const source = term({ term: "API", aliases: ["app-iface", "api-gateway"] });
        const merged = mergeTerm(glossary([target]), source, "add_alias");
        const result = merged.terms.find((t) => t.term === "API");
        expect(result?.aliases).toContain("app-iface");
        expect(result?.aliases).toContain("api-gateway");
    });
    it("archiveTerm moves a term out of the active list (sets archived flag or removes)", () => {
        const g = glossary([term({ term: "API" }), term({ term: "SDK" })]);
        const archived = archiveTerm(g, "API");
        // API should no longer be in the active terms
        expect(archived.terms.find((t) => t.term === "API")).toBeFalsy();
        // SDK remains
        expect(archived.terms.find((t) => t.term === "SDK")).toBeTruthy();
    });
    it("findStaleterms returns terms whose last_updated is old", () => {
        const fresh = term({ term: "FRESH", last_updated: "2026-06-01" });
        const stale = term({ term: "STALE", last_updated: "2024-01-01" });
        const result = findStaleterms(glossary([fresh, stale]), new Date("2026-06-14"));
        expect(result.some((t) => t.term === "STALE")).toBe(true);
        expect(result.some((t) => t.term === "FRESH")).toBe(false);
    });
});
describe("parseGlossary + renderGlossary (round-trip branch coverage)", () => {
    it("parseGlossary returns empty glossary for empty input", () => {
        const g = parseGlossary("");
        expect(g.terms).toEqual([]);
    });
    it("parseGlossary parses a term block (round-trip via renderGlossary)", () => {
        // Build a glossary, render it, parse it back — exercises parse branches.
        const original = glossary([term({ term: "API", aliases: ["app-iface"] })]);
        const rendered = renderGlossary(original);
        const reparsed = parseGlossary(rendered);
        expect(reparsed.terms.length).toBeGreaterThan(0);
        const api = reparsed.terms.find((t) => t.term === "API");
        expect(api).toBeTruthy();
        expect(api?.definition).toContain("Application Programming Interface");
    });
    it("renderGlossary produces non-empty output for a populated glossary", () => {
        const out = renderGlossary(glossary([term()]));
        expect(out).toContain("API");
        expect(out.length).toBeGreaterThan(0);
    });
});
//# sourceMappingURL=glossary-branches.test.js.map