import { describe, expect, it } from "vitest";
import {
  classifyFixRoute,
  type FindingCategory,
  routeForAutofix,
} from "../../src/review/autofix-router.js";
import type { ReviewFinding } from "../../src/review/types.js";

function finding(overrides: Partial<ReviewFinding>): ReviewFinding {
  return {
    severity: "P2",
    confidence: 0.8,
    fixRoute: "manual",
    filePath: "src/a.ts",
    lineNumber: 10,
    description: "issue",
    suggestion: "fix it",
    reviewer: "quality-check",
    ...overrides,
  };
}

describe("classifyFixRoute (ce-inspired R9.1)", () => {
  it("naming/missing-import/trivial-null-check → safe_auto (deterministic local fixes)", () => {
    for (const category of ["naming", "missing-import", "trivial-null-check"] as const) {
      expect(classifyFixRoute(category, "P2", true)).toBe("safe_auto");
    }
  });

  it("error-handling/refactor → gated_auto (touches sensitive boundary)", () => {
    expect(classifyFixRoute("error-handling", "P2", true)).toBe("gated_auto");
    expect(classifyFixRoute("refactor", "P3", true)).toBe("gated_auto");
  });

  it("architecture/api-design → manual (needs human judgment)", () => {
    expect(classifyFixRoute("architecture", "P2", true)).toBe("manual");
    expect(classifyFixRoute("api-design", "P1", true)).toBe("manual");
  });

  it("adversarial/performance → advisory (report-only)", () => {
    expect(classifyFixRoute("adversarial", "P1", true)).toBe("advisory");
    expect(classifyFixRoute("performance", "P2", true)).toBe("advisory");
  });

  it("P0 is NEVER safe_auto even for a trivial-naming category (too critical to auto-apply)", () => {
    expect(classifyFixRoute("naming", "P0", true)).toBe("gated_auto");
    expect(classifyFixRoute("missing-import", "P0", true)).toBe("gated_auto");
  });

  it("no suggestion → manual (can't auto-apply without a fix)", () => {
    expect(classifyFixRoute("naming", "P2", false)).toBe("manual");
  });

  it("unknown/other category → manual (conservative fallback)", () => {
    expect(classifyFixRoute("other" as FindingCategory, "P2", true)).toBe("manual");
  });
});

describe("routeForAutofix (ce-inspired R9.2/R9.3/R9.4)", () => {
  it("splits findings into autoApply (safe) / gated / excluded", () => {
    const findings = [
      finding({ fixRoute: "safe_auto", description: "a" }),
      finding({ fixRoute: "gated_auto", description: "b" }),
      finding({ fixRoute: "manual", description: "c" }),
      finding({ fixRoute: "advisory", description: "d" }),
      finding({ fixRoute: "safe_auto", description: "e" }),
    ];
    const routing = routeForAutofix(findings);
    expect(routing.autoApply).toHaveLength(2); // a, e
    expect(routing.gated).toHaveLength(1); // b
    expect(routing.excluded).toHaveLength(2); // c, d
    expect(routing.autoApply.every((f) => f.fixRoute === "safe_auto")).toBe(true);
    expect(
      routing.excluded.every((f) => f.fixRoute === "manual" || f.fixRoute === "advisory"),
    ).toBe(true);
  });

  it("empty input → all buckets empty", () => {
    const routing = routeForAutofix([]);
    expect(routing.autoApply).toEqual([]);
    expect(routing.gated).toEqual([]);
    expect(routing.excluded).toEqual([]);
  });
});
