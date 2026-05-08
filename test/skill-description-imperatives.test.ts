/**
 * Unit tests for the imperative verb whitelist module.
 *
 * Covers:
 *   - Whitelist is non-empty
 *   - Every entry starts with an uppercase letter
 *   - No duplicate entries
 *   - Core Forge skill verbs are present
 *
 * **Validates: Requirements 1.3, 1.7**
 */

import { describe, expect, it } from "vitest";
import { IMPERATIVE_WHITELIST } from "../src/skill-description-imperatives.js";

describe("IMPERATIVE_WHITELIST", () => {
  it("is non-empty", () => {
    expect(IMPERATIVE_WHITELIST.length).toBeGreaterThan(0);
  });

  it("every entry starts with an uppercase letter", () => {
    for (const verb of IMPERATIVE_WHITELIST) {
      expect(verb[0]).toMatch(/^[A-Z]$/);
    }
  });

  it("has no duplicates", () => {
    const set = new Set(IMPERATIVE_WHITELIST);
    expect(set.size).toBe(IMPERATIVE_WHITELIST.length);
  });

  it("contains core Forge skill verbs", () => {
    const asSet = new Set(IMPERATIVE_WHITELIST);
    for (const required of ["Build", "Plan", "Review", "Ship", "Test"]) {
      expect(asSet.has(required)).toBe(true);
    }
  });
});
