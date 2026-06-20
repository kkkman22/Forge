/**
 * T-01 (Wave 1) — Verify-By:<layer> enforcement (keystone).
 *
 * Req1 AC:
 *   AC1: reject Verify-By lacking `:layer` suffix; legal values are
 *        vitest:unit / vitest:component / bash:contract / forge_exec:e2e / manual.
 *   AC2: when Verify-By missing/illegal, block lock + list missing fields + legal values.
 *   AC3: frontmatter `contract_legacy: true` skips validation.
 *   AC7: [negative] when the AC's Evidence points to a non-existent file, block lock.
 *
 * Also: parseVerifyByLayer(verifyBy): Layer|null pure function.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { looksLikeFilePath, parseVerifyByLayer, validateContract, validateVerifyBy, } from "../src/contract-validator.js";
function specWith(body, frontmatter = "") {
    const fm = frontmatter ? `---\n${frontmatter}\n---\n` : "";
    return `${fm}# Spec\n\n## Acceptance Criteria\n\n${body}\n`;
}
function ac(id, verifyBy, evidence = "src/foo.ts") {
    return `${id}. WHEN something, THE system SHALL do X.
   **Verify-By**: ${verifyBy}
   **Evidence**: ${evidence}`;
}
describe("parseVerifyByLayer — pure function", () => {
    it.each([
        ["vitest:unit", "unit"],
        ["vitest:component", "component"],
        ["bash:contract", "contract"],
        ["forge_exec:e2e", "e2e"],
        ["manual", "manual"],
    ])("parses '%s' → '%s'", (input, expected) => {
        expect(parseVerifyByLayer(input)).toBe(expected);
    });
    it("trims surrounding whitespace", () => {
        expect(parseVerifyByLayer("  vitest:unit  ")).toBe("unit");
    });
    it.each([
        ["vitest", "bare tool name"],
        ["bash", "bare tool name"],
        ["vitest:integration", "unknown layer suffix"],
        ["forge_exec:browser", "unknown layer suffix"],
        ["", "empty"],
        ["cypress:e2e", "unknown tool"],
        [":unit", "missing tool"],
        ["vitest:", "missing layer"],
    ])("returns null for illegal '%s' (%s)", (input) => {
        expect(parseVerifyByLayer(input)).toBeNull();
    });
});
describe("validateVerifyBy — field-level pure function", () => {
    it.each([
        "vitest:unit",
        "vitest:component",
        "bash:contract",
        "forge_exec:e2e",
        "manual",
    ])("accepts legal value '%s'", (value) => {
        expect(validateVerifyBy(value)).toBeNull();
    });
    it.each([
        ["vitest", "bare tool name"],
        ["bash", "bare tool name"],
        ["forge_exec", "bare tool name"],
        ["vitest:integration", "unknown layer"],
        ["unknown:unit", "unknown tool"],
        ["", "empty"],
        ["   ", "blank"],
    ])("rejects '%s' (%s) with an error string", (value) => {
        const err = validateVerifyBy(value);
        expect(err).not.toBeNull();
        expect(err).toMatch(/Verify-By/i);
    });
    it("error message lists the 5 legal values", () => {
        const err = validateVerifyBy("vitest");
        expect(err).toContain("vitest:unit");
        expect(err).toContain("manual");
    });
});
describe("validateContract — layered Verify-By enforcement", () => {
    it("accepts a spec with all 5 legal layer values", () => {
        const spec = specWith([
            ac("1.1", "vitest:unit"),
            ac("1.2", "vitest:component"),
            ac("1.3", "bash:contract"),
            ac("1.4", "forge_exec:e2e"),
            ac("1.5", "manual"),
        ].join("\n\n"));
        const result = validateContract(spec);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });
    it("rejects bare tool name (no :layer suffix)", () => {
        const spec = specWith(ac("1.1", "vitest"));
        const result = validateContract(spec);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes("1.1"))).toBe(true);
        expect(result.errors.some((e) => /Verify-By/i.test(e))).toBe(true);
    });
    it("rejects unknown tool:layer value", () => {
        const spec = specWith(ac("1.1", "cypress:e2e"));
        const result = validateContract(spec);
        expect(result.valid).toBe(false);
    });
    it("rejects empty Verify-By", () => {
        const spec = specWith(ac("1.1", ""));
        const result = validateContract(spec);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => /Verify-By/i.test(e))).toBe(true);
    });
    it("contract_legacy: true skips validation entirely", () => {
        const spec = specWith(ac("1.1", "vitest"), "contract_legacy: true");
        const result = validateContract(spec);
        expect(result.valid).toBe(true);
        expect(result.legacySkipped).toBe(true);
    });
    it("outputs missing-field list with legal values on failure (AC2)", () => {
        const spec = specWith(ac("1.1", "vitest"));
        const result = validateContract(spec);
        expect(result.errors.join("\n")).toContain("vitest:unit");
        expect(result.errors.join("\n")).toContain("manual");
    });
});
describe("validateContract — Evidence existence enforcement (AC7)", () => {
    let tmpRoot;
    beforeEach(() => {
        tmpRoot = mkdtempSync(join(tmpdir(), "forge-ev-"));
    });
    afterEach(() => {
        rmSync(tmpRoot, { recursive: true, force: true });
    });
    it("blocks when Evidence file does not exist on disk (AC7)", () => {
        const ev = join(tmpRoot, "missing.ts");
        const spec = specWith(ac("1.1", "vitest:unit", ev));
        const result = validateContract(spec, { projectRoot: tmpRoot });
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => /Evidence.*not found/i.test(e) && e.includes("1.1"))).toBe(true);
    });
    it("passes when Evidence file exists on disk", () => {
        const ev = join(tmpRoot, "src", "foo.ts");
        mkdirSync(join(tmpRoot, "src"), { recursive: true });
        writeFileSync(ev, "export const x = 1;");
        const rel = "src/foo.ts";
        const spec = specWith(ac("1.1", "vitest:unit", rel));
        const result = validateContract(spec, { projectRoot: tmpRoot });
        expect(result.valid).toBe(true);
    });
    it("skips Evidence-existence check when option disabled (back-compat)", () => {
        const ev = join(tmpRoot, "missing.ts");
        const spec = specWith(ac("1.1", "vitest:unit", ev));
        const result = validateContract(spec, { projectRoot: tmpRoot, checkEvidenceExists: false });
        expect(result.valid).toBe(true);
    });
    it("evidence with multiple comma paths: blocks if ANY missing", () => {
        const exists = join(tmpRoot, "src", "a.ts");
        mkdirSync(join(tmpRoot, "src"), { recursive: true });
        writeFileSync(exists, "x");
        const spec = specWith(ac("1.1", "vitest:unit", "src/a.ts, src/missing.ts"));
        const result = validateContract(spec, { projectRoot: tmpRoot });
        expect(result.valid).toBe(false);
    });
    it("does not throw when projectRoot not provided (skips existence)", () => {
        const spec = specWith(ac("1.1", "vitest:unit", "some/relative.ts"));
        expect(() => validateContract(spec)).not.toThrow();
        expect(existsSync("some/relative.ts")).toBe(false);
    });
    it("does NOT block descriptive Evidence prose (brownfield back-compat, NFR-2)", () => {
        // Real Forge specs use prose like "test passes", commands, CJK descriptions.
        // AC7 must only validate path-shaped tokens, never free-form text.
        const prose = [
            "test passes",
            "npm run test:coverage exit 0",
            "测试覆盖 4 种 freshness 场景",
            "运行测试前后 .forge/reviews/ 目录内容不变",
        ];
        for (const ev of prose) {
            const spec = specWith(ac("1.1", "vitest:unit", ev));
            const result = validateContract(spec, { projectRoot: tmpRoot });
            expect(result.valid, `prose Evidence "${ev}" must not be blocked`).toBe(true);
        }
    });
});
describe("looksLikeFilePath — path-shape heuristic", () => {
    it.each([
        "src/foo.ts",
        "test/foo.test.ts",
        "./src/foo.ts",
        "scripts/init.sh",
        "test/foo.test.ts",
        "packages/services/lib/api.d.ts",
    ])("returns true for path-shaped '%s'", (tok) => {
        expect(looksLikeFilePath(tok)).toBe(true);
    });
    it.each([
        "test passes",
        "npm run test:coverage exit 0",
        "测试覆盖场景",
        "",
        "foo bar baz",
        "vitest run && echo done",
    ])("returns false for non-path '%s'", (tok) => {
        expect(looksLikeFilePath(tok)).toBe(false);
    });
});
describe("validateContract — layered value still rejects placeholder Evidence", () => {
    it.each([
        "tbd",
        "待补",
        "todo",
        "pending",
        "n/a",
        "—",
    ])("rejects placeholder Evidence '%s' even with legal layer", (placeholder) => {
        const spec = specWith(ac("1.1", "vitest:unit", placeholder));
        const result = validateContract(spec);
        expect(result.valid).toBe(false);
    });
});
// Type-level sanity: Layer union has exactly the documented members.
const _layerCheck = null;
void _layerCheck;
//# sourceMappingURL=check-spec-contract.property.test.js.map