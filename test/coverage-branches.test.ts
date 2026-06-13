import { describe, expect, it } from "vitest";
import {
  canParseTestOutput,
  classifySource,
  computeContextBudgetThresholds,
  serializeExploreResult,
} from "../src/context-budget.js";
import { type AtomicRule, renderSuggestionSuffix } from "../src/rules-loader.js";

describe("context-budget: classifySource (branch coverage)", () => {
  it("returns a lifecycle for known sources", () => {
    expect(classifySource("plan-task-list")).toBeDefined();
    expect(classifySource("current-task")).toBeDefined();
  });
  it("returns undefined for unknown sources", () => {
    expect(classifySource("nonexistent-source")).toBeUndefined();
  });
});

describe("context-budget: computeContextBudgetThresholds (branch coverage)", () => {
  it("uses context-window as the base when supplied", () => {
    const t = computeContextBudgetThresholds({ contextWindowTokens: 200_000 });
    expect(t.source).toBe("context-window");
    expect(t.compactTokens).toBeGreaterThan(0);
  });
  it("falls back to configured-budget when context-window omitted", () => {
    const t = computeContextBudgetThresholds({ configuredBudgetTokens: 100_000 });
    expect(t.source).toBe("configured-budget");
  });
  it("uses default ratio fallbacks when ratios omitted", () => {
    const t = computeContextBudgetThresholds({ contextWindowTokens: 100_000 });
    expect(t.warningTokens).toBeGreaterThan(0);
    expect(t.criticalTokens).toBeGreaterThan(t.compactTokens);
  });
  it("respects custom ratios when supplied", () => {
    const t = computeContextBudgetThresholds({
      contextWindowTokens: 100_000,
      warningRatio: 0.5,
      compactRatio: 0.7,
      criticalRatio: 0.9,
    });
    expect(t.warningTokens).toBe(50_000);
    expect(t.compactTokens).toBe(70_000);
    expect(t.criticalTokens).toBe(90_000);
  });
  it("handles invalid/zero contextWindowTokens gracefully (falls back)", () => {
    const t = computeContextBudgetThresholds({
      contextWindowTokens: 0,
      configuredBudgetTokens: 50_000,
    });
    expect(t.compactTokens).toBeGreaterThan(0);
  });
});

describe("context-budget: serializeExploreResult edge cases (branch coverage)", () => {
  it("accepts a raw string", () => {
    expect(serializeExploreResult("raw string")).toBe("raw string");
  });
  it("accepts null/undefined → string output", () => {
    expect(typeof serializeExploreResult(null)).toBe("string");
    expect(typeof serializeExploreResult(undefined)).toBe("string");
  });
});

describe("context-budget: canParseTestOutput (branch coverage)", () => {
  it("returns false for non-test output", () => {
    expect(canParseTestOutput("not test output")).toBe(false);
    expect(canParseTestOutput("")).toBe(false);
  });
});

describe("rules-loader: renderSuggestionSuffix (branch coverage)", () => {
  it("returns empty when no lintBinding", () => {
    expect(renderSuggestionSuffix({} as AtomicRule)).toBe("");
  });
  it("renders a string lintBinding", () => {
    expect(renderSuggestionSuffix({ lintBinding: "no-console" } as AtomicRule)).toBe(
      " (lint: no-console)",
    );
  });
  it("renders an object lintBinding with both biome + eslint", () => {
    const r = renderSuggestionSuffix({
      lintBinding: { biome: "noConsole", eslint: "no-console" },
    } as AtomicRule);
    expect(r).toContain("biome: noConsole");
    expect(r).toContain("eslint: no-console");
  });
  it("renders an object lintBinding with only biome", () => {
    const r = renderSuggestionSuffix({
      lintBinding: { biome: "noConsole", eslint: "" },
    } as AtomicRule);
    expect(r).toContain("biome: noConsole");
    expect(r).not.toContain("eslint:");
  });
  it("renders empty for an object lintBinding with neither set", () => {
    const r = renderSuggestionSuffix({
      lintBinding: { biome: "", eslint: "" },
    } as AtomicRule);
    expect(r).toBe("");
  });
});
