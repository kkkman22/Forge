import { describe, expect, it } from "vitest";
import {
  COMPACT_SAFE_ENABLED_LAYERS,
  COMPACT_SAFE_SKIPPED_LAYERS,
  compactSafeDedup,
  DEFAULT_COMPACT_SAFE_THRESHOLD,
  decideCompactSafe,
  filterToCompactSafeLayers,
  formatCompactSafeFinding,
  renderCompactSafeBanner,
} from "../../src/review/compact-safe.js";
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
    reviewer: "spec-check",
    ...overrides,
  };
}

describe("decideCompactSafe (ce-inspired R10.1/R10.2)", () => {
  it("engages compact-safe when currentTokens >= threshold", () => {
    const d = decideCompactSafe(120_000, 100_000);
    expect(d.compactSafe).toBe(true);
    expect(d.threshold).toBe(100_000);
    expect(d.reason).toContain("compact-safe");
  });

  it("does not engage when context is below threshold", () => {
    const d = decideCompactSafe(50_000, 100_000);
    expect(d.compactSafe).toBe(false);
    expect(d.reason).toContain("full review");
  });

  it("falls back to the default 100K threshold when omitted", () => {
    const d = decideCompactSafe(100_000);
    expect(d.compactSafe).toBe(true);
    expect(d.threshold).toBe(DEFAULT_COMPACT_SAFE_THRESHOLD);
  });

  it("returns full review when context size is unknown (0/undefined)", () => {
    expect(decideCompactSafe(undefined).compactSafe).toBe(false);
    expect(decideCompactSafe(0).compactSafe).toBe(false);
  });
});

describe("filterToCompactSafeLayers (R10.2 — keep spec + security only)", () => {
  it("keeps spec-check + security-check, drops quality + adversarial", () => {
    const findings = [
      finding({ reviewer: "spec-check", description: "s" }),
      finding({ reviewer: "quality-check", description: "q" }),
      finding({ reviewer: "security-check", description: "sec" }),
      finding({ reviewer: "adversarial-check", description: "adv" }),
    ];
    const kept = filterToCompactSafeLayers(findings);
    expect(kept).toHaveLength(2);
    expect(kept.every((f) => COMPACT_SAFE_ENABLED_LAYERS.includes(f.reviewer as never))).toBe(true);
    expect(kept.some((f) => f.reviewer === "quality-check")).toBe(false);
  });
});

describe("compactSafeDedup (R10.2 — simplified file+line dedup)", () => {
  it("dedupes by file+line, keeping the first and merging reviewers", () => {
    const findings = [
      finding({ reviewer: "spec-check", filePath: "a.ts", lineNumber: 5, severity: "P2" }),
      finding({ reviewer: "security-check", filePath: "a.ts", lineNumber: 5, severity: "P1" }),
    ];
    const merged = compactSafeDedup(findings);
    expect(merged).toHaveLength(1);
    expect(merged[0].reviewers).toEqual(["spec-check", "security-check"]);
    expect(merged[0].crossValidated).toBe(true);
    // Keep-the-worst: P1 wins over P2 at the same location.
    expect(merged[0].severity).toBe("P1");
  });

  it("keeps separate findings at different lines (no over-dedup)", () => {
    const findings = [
      finding({ filePath: "a.ts", lineNumber: 5 }),
      finding({ filePath: "a.ts", lineNumber: 6 }),
    ];
    expect(compactSafeDedup(findings)).toHaveLength(2);
  });
});

describe("renderCompactSafeBanner + formatCompactSafeFinding (R10.2/R10.3)", () => {
  it("banner lists skipped reviewers + unchanged confidence gate", () => {
    const banner = renderCompactSafeBanner();
    expect(banner).toContain("⚠ Compact-safe mode");
    expect(banner).toContain("quality-check");
    expect(banner).toContain("adversarial-check");
    expect(banner).toContain("Confidence gate strictness unchanged");
  });

  it("concise format shows id/severity/title/file:line only", () => {
    const f = finding({
      severity: "P0",
      description: "sql injection",
      filePath: "b.ts",
      lineNumber: 42,
    });
    // formatCompactSafeFinding takes a MergedFinding; construct one inline.
    const merged = { ...f, reviewers: ["security-check"], crossValidated: false };
    const line = formatCompactSafeFinding(merged, "R", 0);
    expect(line).toContain("[R-001]");
    expect(line).toContain("[P0]");
    expect(line).toContain("sql injection");
    expect(line).toContain("b.ts:42");
    // No suggestion detail in concise mode.
    expect(line).not.toContain("fix it");
  });
});
