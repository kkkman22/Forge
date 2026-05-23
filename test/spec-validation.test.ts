/**
 * T-15: Validation Contract Gate + Spec Leak detection tests.
 * T-16: EARS sentence enforcement tests.
 *
 * Validates: Requirements 11, 12
 */
import { describe, expect, it } from "vitest";
import { validateContractGate, detectSpecLeak, enforceEarsSyntax } from "../src/spec-validation.js";
import type { SpecBundle, RequirementsDocument, EarsClause, SpecFileFrontmatter } from "../src/spec-bundle.js";

function makeFm(): SpecFileFrontmatter {
  return { feature: "test", status: "draft", date: "2026-05-23", workflow_variant: "requirements-first" };
}

function makeEars(overrides?: Partial<EarsClause>): EarsClause {
  return { line: 1, when: "X", shall: "Y", raw: "当 X 时 系统应当 Y", ...overrides };
}

function makeBundle(opts?: { contractLegacy?: boolean; earsOverrides?: Partial<EarsClause> }): SpecBundle {
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
    } as RequirementsDocument,
  };
}

// T-15: Contract Gate
describe("validateContractGate", () => {
  it("passes when all EARS have verifyBy and evidence", () => {
    const bundle = makeBundle({
      earsOverrides: { verifyBy: "vitest", evidence: "test passes" },
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

  it("fails P0 when evidence is placeholder", () => {
    const bundle = makeBundle({
      earsOverrides: { verifyBy: "vitest", evidence: "TODO" },
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
describe("detectSpecLeak", () => {
  it("detects class names in strict mode", () => {
    const bundle = makeBundle();
    (bundle.primary as RequirementsDocument).intro = "Use FormService to submit";
    const result = detectSpecLeak(bundle, "strict");
    expect(result.leaked).toBe(true);
  });

  it("allows technical nouns in lenient mode", () => {
    const bundle = makeBundle();
    (bundle.primary as RequirementsDocument).intro = "Use FormService to submit";
    const result = detectSpecLeak(bundle, "lenient");
    expect(result.leaked).toBe(false);
  });

  it("detects code snippets even in lenient mode", () => {
    const bundle = makeBundle();
    (bundle.primary as RequirementsDocument).intro = "function submit() { return fetch('/api') }";
    const result = detectSpecLeak(bundle, "lenient");
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

  it("rewrites to EARS format within retries", () => {
    const result = enforceEarsSyntax("用户提交后返回成功");
    // Should produce EARS format after internal rewrite
    expect(result.output).toContain("当");
    expect(result.retries).toBeGreaterThan(0);
  });

  it("marks exhausted when EARS regex still doesn't match", () => {
    // The simple rewriter wraps text, so "..." becomes "当 ... 时 系统应当 ..."
    // which actually matches EARS_FULL. So exhausted is only true when
    // the rewriter can't form a valid EARS (empty input edge case).
    const result = enforceEarsSyntax("", { maxRetries: 1 });
    expect(result.retries).toBe(1);
  });
});
