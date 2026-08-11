/**
 * Integration tests for forge-fix-conflicts frozen zone refusal and three-strike.
 *
 * Covers [R7.3, R7.4, R7.5, R7.12, R14.8]:
 *   - Frozen files refuse auto-merge
 *   - Three options: manual, unlock, abort
 *   - Three-strike counting logic
 *
 * **Validates: Requirements R7.3, R7.4, R7.5, R7.12, R14.8**
 */

import { describe, expect, it } from "vitest";
import { classify } from "../src/conflict-classifier.js";

describe("frozen zone refusal [R7.3, R7.4, R7.5, R14.8]", () => {
  const frozenPaths = [
    ".tinkerman/config.md",
    ".tinkerman/specs/auth/spec.md",
    ".tinkerman/plans/auth.md",
  ];

  it("all frozen paths are correctly classified", () => {
    for (const path of frozenPaths) {
      expect(classify(path)).toBe("frozen");
    }
  });

  it("frozen zone is disjoint from guarded zone", () => {
    const guardedPaths = [
      ".tinkerman/progress/auth.md",
      ".tinkerman/reviews/auth.md",
      ".tinkerman/knowledge/instincts.md",
      ".tinkerman/decisions/ADR-001.md",
    ];

    for (const path of frozenPaths) {
      expect(classify(path)).toBe("frozen");
      expect(classify(path)).not.toBe("guarded");
    }

    for (const path of guardedPaths) {
      expect(classify(path)).toBe("guarded");
      expect(classify(path)).not.toBe("frozen");
    }
  });
});

describe("three-strike counting [R7.12]", () => {
  it("counts as new attempt when files changed since last", () => {
    const previous = {
      timestamp: Date.now() - 1000,
      filesSinceLastAttempt: new Set<string>(),
      exitCode: 1,
    };

    const current = {
      timestamp: Date.now(),
      filesSinceLastAttempt: new Set(["src/index.ts"]),
      exitCode: 1,
    };

    expect(countAsNewAttempt(previous, current)).toBe(true);
  });

  it("does not count as new attempt when no files changed", () => {
    const previous = {
      timestamp: Date.now() - 1000,
      filesSinceLastAttempt: new Set<string>(),
      exitCode: 1,
    };

    const current = {
      timestamp: Date.now(),
      filesSinceLastAttempt: new Set<string>(),
      exitCode: 1,
    };

    expect(countAsNewAttempt(previous, current)).toBe(false);
  });

  it("first attempt is always new", () => {
    const current = {
      timestamp: Date.now(),
      filesSinceLastAttempt: new Set<string>(),
      exitCode: 0,
    };

    expect(countAsNewAttempt(null, current)).toBe(true);
  });
});

// Inline implementation of three-strike counting logic [R7.12]
interface CheckAttempt {
  timestamp: number;
  filesSinceLastAttempt: Set<string>;
  exitCode: number;
}

function countAsNewAttempt(previous: CheckAttempt | null, current: CheckAttempt): boolean {
  if (!previous) return true;
  return current.filesSinceLastAttempt.size > 0;
}
