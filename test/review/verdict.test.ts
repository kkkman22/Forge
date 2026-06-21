import { describe, expect, it } from "vitest";

import type { ReviewFinding } from "../../src/review/types.js";
import {
  coerceVerdict,
  computeAllGreen,
  isUnverifiable,
  normalizeVerdict,
  validateUnverifiable,
} from "../../src/review/verdict.js";

function finding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    severity: "P1",
    confidence: 0.9,
    fixRoute: "manual",
    filePath: "src/a.ts",
    lineNumber: 10,
    description: "missing",
    suggestion: "add it",
    reviewer: "spec-check",
    ...overrides,
  };
}

describe("normalizeVerdict", () => {
  it("returns the declared verdict when present", () => {
    expect(normalizeVerdict({ verdict: "pass" })).toBe("pass");
    expect(normalizeVerdict({ verdict: "fail" })).toBe("fail");
    expect(normalizeVerdict({ verdict: "unverifiable" })).toBe("unverifiable");
  });

  it("defaults absent verdict to fail (R1.AC4 conservative back-compat)", () => {
    expect(normalizeVerdict({})).toBe("fail");
    expect(normalizeVerdict({ verdict: undefined })).toBe("fail");
  });
});

describe("validateUnverifiable", () => {
  it("returns null for a well-formed unverifiable finding (P2 + non-empty reason)", () => {
    const f = finding({
      verdict: "unverifiable",
      severity: "P2",
      unverifiable_reason: "req 3 → src/legacy.ts not in diff",
    });
    expect(validateUnverifiable(f)).toBeNull();
  });

  it("returns null for non-unverifiable findings (no extra requirements)", () => {
    expect(validateUnverifiable(finding({ verdict: "pass" }))).toBeNull();
    expect(validateUnverifiable(finding({ verdict: "fail" }))).toBeNull();
  });

  it("errors when unverifiable has empty reason (R1.AC2)", () => {
    const f = finding({ verdict: "unverifiable", severity: "P2", unverifiable_reason: "" });
    expect(validateUnverifiable(f)).toContain("unverifiable_reason");
  });

  it("errors when unverifiable has whitespace-only reason", () => {
    const f = finding({ verdict: "unverifiable", severity: "P2", unverifiable_reason: "   " });
    expect(validateUnverifiable(f)).toContain("unverifiable_reason");
  });

  it("errors when unverifiable is not P2 (R1.AC2 must-be-P2)", () => {
    const f = finding({
      verdict: "unverifiable",
      severity: "P1",
      unverifiable_reason: "ok reason",
    });
    expect(validateUnverifiable(f)).toContain("P2");
  });
});

describe("coerceVerdict", () => {
  it("preserves a valid unverifiable finding unchanged", () => {
    const f = finding({
      verdict: "unverifiable",
      severity: "P2",
      unverifiable_reason: "req 3 → legacy.ts",
    });
    expect(coerceVerdict(f)).toEqual(f);
  });

  it("resets invalid unverifiable (missing reason) to fail — strips verdict fields", () => {
    const f = finding({ verdict: "unverifiable", severity: "P2", unverifiable_reason: "" });
    const coerced = coerceVerdict(f);
    expect(coerced.verdict).toBeUndefined();
    expect(coerced.unverifiable_reason).toBeUndefined();
    expect(coerced.severity).toBe("P2");
  });

  it("does not mutate the input finding", () => {
    const f = finding({ verdict: "unverifiable", severity: "P2", unverifiable_reason: "" });
    coerceVerdict(f);
    expect(f.verdict).toBe("unverifiable");
    expect(f.unverifiable_reason).toBe("");
  });
});

describe("computeAllGreen", () => {
  it("returns allGreen true for empty findings", () => {
    expect(computeAllGreen([])).toEqual({ allGreen: true, pending_controller_verification: [] });
  });

  it("returns allGreen true when only pass/P3 findings", () => {
    const r = computeAllGreen([{ severity: "P3", verdict: "pass" }]);
    expect(r.allGreen).toBe(true);
  });

  it("returns allGreen false when a P0/P1 fail exists", () => {
    const r = computeAllGreen([{ severity: "P1", verdict: "fail" }]);
    expect(r.allGreen).toBe(false);
    expect(r.pending_controller_verification).toEqual([]);
  });

  it("returns allGreen false when only unverifiable exists (R3.AC3, no fail)", () => {
    const r = computeAllGreen([
      { severity: "P2", verdict: "unverifiable", unverifiable_reason: "req 3 → legacy.ts" },
    ]);
    expect(r.allGreen).toBe(false);
    expect(r.pending_controller_verification).toEqual(["req 3 → legacy.ts"]);
  });

  it("collects multiple unverifiable reasons into pending list", () => {
    const r = computeAllGreen([
      { severity: "P2", verdict: "unverifiable", unverifiable_reason: "req A" },
      { severity: "P2", verdict: "unverifiable", unverifiable_reason: "req B" },
    ]);
    expect(r.allGreen).toBe(false);
    expect(r.pending_controller_verification).toEqual(["req A", "req B"]);
  });

  it("treats legacy finding without verdict as fail (R1.AC4)", () => {
    const r = computeAllGreen([{ severity: "P1" }]);
    expect(r.allGreen).toBe(false);
  });

  it("P2 fail alone does NOT block all-green (advisory only)", () => {
    const r = computeAllGreen([{ severity: "P2", verdict: "fail" }]);
    expect(r.allGreen).toBe(true);
  });
});

describe("isUnverifiable", () => {
  it("true only for unverifiable", () => {
    expect(isUnverifiable({ verdict: "unverifiable" })).toBe(true);
    expect(isUnverifiable({ verdict: "pass" })).toBe(false);
    expect(isUnverifiable({ verdict: "fail" })).toBe(false);
    expect(isUnverifiable({})).toBe(false);
  });
});
