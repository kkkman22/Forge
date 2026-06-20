/**
 * T-15: Validation Contract Gate + Spec Leak detection tests.
 * T-16: EARS sentence enforcement tests.
 *
 * Validates: Requirements 11, 12
 */
import { describe, expect, it } from "vitest";
import { detectSpecLeakFromBundle, enforceEarsSyntax, validateContractGate, } from "../src/spec-validation.js";
function makeFm() {
    return {
        feature: "test",
        status: "draft",
        date: "2026-05-23",
        workflow_variant: "requirements-first",
    };
}
function makeEars(overrides) {
    return { line: 1, when: "X", shall: "Y", raw: "当 X 时 系统应当 Y", ...overrides };
}
function makeBundle(opts) {
    return {
        feature: "test",
        kind: "feature",
        layout: "three-file",
        variant: "requirements-first",
        primary: {
            frontmatter: { ...makeFm(), contract_legacy: opts?.contractLegacy },
            intro: "",
            glossary: [],
            userStories: [],
            earsCriteria: [makeEars(opts?.earsOverrides)],
            nonFunctional: [],
            outOfScope: [],
        },
    };
}
// T-15: Contract Gate
describe("validateContractGate", () => {
    it("passes when all EARS have layered verifyBy and evidence", () => {
        const bundle = makeBundle({
            earsOverrides: { verifyBy: "vitest:unit", evidence: "test passes" },
        });
        const result = validateContractGate(bundle);
        expect(result.pass).toBe(true);
    });
    it("fails P0 when verifyBy missing", () => {
        const bundle = makeBundle({ earsOverrides: { evidence: "test passes" } });
        const result = validateContractGate(bundle);
        expect(result.pass).toBe(false);
        expect(result.findings[0].severity).toBe("P0");
    });
    it("fails P0 when verifyBy uses legacy flat grammar (Req1)", () => {
        const bundle = makeBundle({
            earsOverrides: { verifyBy: "vitest", evidence: "test passes" },
        });
        const result = validateContractGate(bundle);
        expect(result.pass).toBe(false);
    });
    it("fails P0 when evidence is placeholder", () => {
        const bundle = makeBundle({
            earsOverrides: { verifyBy: "vitest:unit", evidence: "TODO" },
        });
        const result = validateContractGate(bundle);
        expect(result.pass).toBe(false);
    });
    it("skips when contract_legacy is true", () => {
        const bundle = makeBundle({ contractLegacy: true });
        const result = validateContractGate(bundle);
        expect(result.pass).toBe(true);
        expect(result.skipped).toBe(true);
    });
});
// T-15: Spec Leak
describe("detectSpecLeakFromBundle", () => {
    it("detects class names in strict mode", () => {
        const bundle = makeBundle();
        bundle.primary.intro = "Use FormService to submit";
        const result = detectSpecLeakFromBundle(bundle, "strict");
        expect(result.leaked).toBe(true);
    });
    it("allows technical nouns in lenient mode", () => {
        const bundle = makeBundle();
        bundle.primary.intro = "Use FormService to submit";
        const result = detectSpecLeakFromBundle(bundle, "lenient");
        expect(result.leaked).toBe(false);
    });
    it("detects code snippets even in lenient mode", () => {
        const bundle = makeBundle();
        bundle.primary.intro = "function submit() { return fetch('/api') }";
        const result = detectSpecLeakFromBundle(bundle, "lenient");
        expect(result.leaked).toBe(true);
    });
});
// T-16: EARS enforcement
describe("enforceEarsSyntax", () => {
    it("returns EARS-compliant text unchanged", () => {
        const result = enforceEarsSyntax("当 用户提交 时 系统应当 返回成功");
        expect(result.output).toBe("当 用户提交 时 系统应当 返回成功");
        expect(result.retries).toBe(0);
    });
    it("rewrites arrow-style to EARS format", () => {
        const result = enforceEarsSyntax("用户提交 → 返回成功");
        expect(result.output).toBe("当 用户提交 时 系统应当 返回成功");
        expect(result.retries).toBe(1);
    });
    it("rewrites '后' style to EARS format", () => {
        const result = enforceEarsSyntax("用户提交后返回成功");
        expect(result.output).toContain("当");
        expect(result.output).toContain("系统应当");
        expect(result.retries).toBeGreaterThan(0);
    });
    it("marks exhausted when input is empty", () => {
        const result = enforceEarsSyntax("", { maxRetries: 3 });
        expect(result.exhausted).toBe(true);
    });
    it("marks exhausted when no rewrite strategy matches", () => {
        const result = enforceEarsSyntax("@#$%", { maxRetries: 3 });
        expect(result.exhausted).toBe(true);
        expect(result.output).toBe("@#$%"); // returned unchanged so ANL-01 can flag
    });
    it("comma-style rewrites to EARS format", () => {
        const result = enforceEarsSyntax("用户提交，返回成功");
        expect(result.output).toBe("当 用户提交 时 系统应当 返回成功");
        expect(result.retries).toBe(4);
    });
    it("legacy EARS format passes through unchanged", () => {
        const result = enforceEarsSyntax("当 提交 则 成功");
        expect(result.output).toBe("当 提交 则 成功");
        expect(result.retries).toBe(0);
    });
});
//# sourceMappingURL=spec-validation.test.js.map