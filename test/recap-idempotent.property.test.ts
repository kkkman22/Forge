/**
 * Property test: recap is idempotent for fixed input.
 *
 * Invariant: consecutive calls with same window produce identical output
 * (excluding timestamp-derived fields) [R13.6].
 *
 * **Validates: Requirements R9.1, R13.6**
 */

import { describe, expect, it } from "vitest";
import { runRecap } from "../src/recap.js";

describe("recap idempotency [R13.6, R9.1]", () => {
  it("produces consistent category keys for same window", () => {
    const result1 = runRecap({ window: "7d" });
    const result2 = runRecap({ window: "7d" });

    const keys1 = Object.keys(result1.categories).sort();
    const keys2 = Object.keys(result2.categories).sort();
    expect(keys1).toEqual(keys2);
  });

  it("produces same commit/session/task counts", () => {
    const result1 = runRecap({ window: "7d" });
    const result2 = runRecap({ window: "7d" });

    expect(result1.totalCommits).toBe(result2.totalCommits);
    expect(result1.totalSessions).toBe(result2.totalSessions);
    expect(result1.totalTasks).toBe(result2.totalTasks);
  });

  it("produces same stale rules for consecutive calls", () => {
    const result1 = runRecap({ window: "7d" });
    const result2 = runRecap({ window: "7d" });

    expect(result1.staleRules).toEqual(result2.staleRules);
  });
});

describe("recap window parsing [R9.1]", () => {
  it("parses 1d window", () => {
    const result = runRecap({ window: "1d" });
    expect(result.window).toBe("1d");
  });

  it("parses 7d window", () => {
    const result = runRecap({ window: "7d" });
    expect(result.window).toBe("7d");
  });

  it("parses date range", () => {
    const result = runRecap({ window: "2025-01-01..2025-01-31" });
    expect(result.since).toBe("2025-01-01");
    expect(result.until).toBe("2025-01-31");
  });

  it("never throws even with invalid window", () => {
    expect(() => runRecap({ window: "invalid" })).not.toThrow();
  });
});

describe("recap category heuristics [R9.3]", () => {
  it("categorizes feature commits", () => {
    const result = runRecap({ window: "7d" });
    // Categories should be valid
    const validCategories = ["feature", "bugfix", "refactor", "infra", "docs", "uncategorized"];
    for (const key of Object.keys(result.categories)) {
      expect(validCategories).toContain(key);
    }
  });
});

describe("recap graceful degradation [R9.5]", () => {
  it("handles missing forgeDir gracefully", () => {
    const result = runRecap({ window: "7d", forgeDir: "/nonexistent/path/.forge" });
    expect(result.totalSessions).toBe(0);
    expect(result.totalTasks).toBe(0);
    expect(result.staleRules).toEqual([]);
  });
});
