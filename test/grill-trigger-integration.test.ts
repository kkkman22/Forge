/**
 * Integration tests for the grill trigger detection module (Task 4.5).
 *
 * Covers:
 *   - `detectGrillTrigger` recognises every documented keyword phrase
 *     and is robust to case variation and surrounding context.
 *   - `detectGrillTrigger` returns `false` for unrelated input so the
 *     router doesn't falsely propose grilling.
 *   - `buildGrillSuggestion` returns a non-empty suggestion only for
 *     `tier === "full"`; light / standard tiers receive `null`.
 *
 * **Validates: Requirements 4.3**
 */

import { describe, expect, it } from "vitest";
import { buildGrillSuggestion, detectGrillTrigger } from "../src/grill-trigger.js";

describe("detectGrillTrigger", () => {
  const TRIGGER_KEYWORDS = [
    "/tinkerman grill",
    "grill me",
    "grill harder",
    "dig deeper",
    "再挖深点",
  ] as const;

  for (const keyword of TRIGGER_KEYWORDS) {
    it(`returns true for keyword "${keyword}"`, () => {
      expect(detectGrillTrigger(keyword)).toBe(true);
    });

    it(`returns true when "${keyword}" is surrounded by other text`, () => {
      expect(detectGrillTrigger(`please ${keyword} on the auth flow`)).toBe(true);
    });
  }

  it("matches case-insensitively for ASCII keywords", () => {
    expect(detectGrillTrigger("GRILL ME")).toBe(true);
    expect(detectGrillTrigger("Dig Deeper")).toBe(true);
    expect(detectGrillTrigger("/Tinkerman Grill")).toBe(true);
  });

  it("returns false for unrelated input", () => {
    expect(detectGrillTrigger("add pagination to /users API")).toBe(false);
    expect(detectGrillTrigger("refactor the router module")).toBe(false);
    expect(detectGrillTrigger("fix typo in README")).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(detectGrillTrigger("")).toBe(false);
  });

  it("returns false for near-miss phrases that don't contain a full keyword", () => {
    // 'grill' alone is too generic — we require the full phrase
    expect(detectGrillTrigger("grill")).toBe(false);
    expect(detectGrillTrigger("deeper")).toBe(false);
  });
});

describe("buildGrillSuggestion", () => {
  it("returns a non-null non-empty string for tier=full", () => {
    const suggestion = buildGrillSuggestion("full");
    expect(suggestion).not.toBeNull();
    expect(typeof suggestion).toBe("string");
    expect((suggestion as string).length).toBeGreaterThan(0);
  });

  it("mentions /tinkerman grill in the full-tier suggestion", () => {
    const suggestion = buildGrillSuggestion("full");
    expect(suggestion).toContain("/tinkerman grill");
  });

  it("returns null for tier=standard", () => {
    expect(buildGrillSuggestion("standard")).toBeNull();
  });

  it("returns null for tier=light", () => {
    expect(buildGrillSuggestion("light")).toBeNull();
  });
});
