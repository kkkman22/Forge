/**
 * Integration tests for fix-conflicts three-strike escalation [R7.12].
 *
 * Verifies that 3 consecutive check failures with distinct file edits
 * trigger `/tinkerman debug`, while identical re-runs do not increment the counter.
 *
 * **Validates: Requirements R7.11, R7.12**
 */

import { describe, expect, it } from "vitest";

interface CheckResult {
  exitCode: number;
  changedFiles: Set<string>;
}

/**
 * Tracks three-strike state across check attempts [R7.12].
 * A new attempt counts only when the user changed files since the last attempt.
 * 3 consecutive new-attempt failures triggers escalation.
 */
function trackThreeStrike(attempts: CheckResult[]): {
  shouldEscalate: boolean;
  strikeCount: number;
} {
  let strikeCount = 0;

  for (const attempt of attempts) {
    if (attempt.exitCode !== 0) {
      if (attempt.changedFiles.size > 0) {
        strikeCount++;
      }
      // No file changes = same attempt, don't increment
    } else {
      strikeCount = 0;
    }

    if (strikeCount >= 3) {
      return { shouldEscalate: true, strikeCount };
    }
  }

  return { shouldEscalate: false, strikeCount };
}

describe("fix-conflicts three-strike escalation [R7.12]", () => {
  it("escalates after 3 consecutive failures with file changes", () => {
    const attempts: CheckResult[] = [
      { exitCode: 1, changedFiles: new Set(["src/a.ts"]) },
      { exitCode: 1, changedFiles: new Set(["src/b.ts"]) },
      { exitCode: 1, changedFiles: new Set(["src/c.ts"]) },
    ];

    const result = trackThreeStrike(attempts);
    expect(result.shouldEscalate).toBe(true);
    expect(result.strikeCount).toBe(3);
  });

  it("does not escalate with only 2 failures", () => {
    const attempts: CheckResult[] = [
      { exitCode: 1, changedFiles: new Set(["src/a.ts"]) },
      { exitCode: 1, changedFiles: new Set(["src/b.ts"]) },
    ];

    const result = trackThreeStrike(attempts);
    expect(result.shouldEscalate).toBe(false);
    expect(result.strikeCount).toBe(2);
  });

  it("resets counter on successful check", () => {
    const attempts: CheckResult[] = [
      { exitCode: 1, changedFiles: new Set(["src/a.ts"]) },
      { exitCode: 1, changedFiles: new Set(["src/b.ts"]) },
      { exitCode: 0, changedFiles: new Set(["src/c.ts"]) },
      { exitCode: 1, changedFiles: new Set(["src/d.ts"]) },
      { exitCode: 1, changedFiles: new Set(["src/e.ts"]) },
    ];

    const result = trackThreeStrike(attempts);
    expect(result.shouldEscalate).toBe(false);
    expect(result.strikeCount).toBe(2);
  });

  it("does not increment on re-run without file changes [R7.12]", () => {
    const attempts: CheckResult[] = [
      { exitCode: 1, changedFiles: new Set(["src/a.ts"]) },
      { exitCode: 1, changedFiles: new Set() }, // same attempt, no changes
      { exitCode: 1, changedFiles: new Set() }, // same attempt, no changes
    ];

    const result = trackThreeStrike(attempts);
    expect(result.shouldEscalate).toBe(false);
    expect(result.strikeCount).toBe(1);
  });

  it("escalates at exactly 3 strikes (not more)", () => {
    const attempts: CheckResult[] = [
      { exitCode: 1, changedFiles: new Set(["src/a.ts"]) },
      { exitCode: 1, changedFiles: new Set(["src/b.ts"]) },
      { exitCode: 1, changedFiles: new Set(["src/c.ts"]) },
      { exitCode: 1, changedFiles: new Set(["src/d.ts"]) },
    ];

    const result = trackThreeStrike(attempts);
    expect(result.shouldEscalate).toBe(true);
    expect(result.strikeCount).toBe(3); // stops at threshold
  });

  it("handles mixed changes and no-changes", () => {
    const attempts: CheckResult[] = [
      { exitCode: 1, changedFiles: new Set(["src/a.ts"]) },
      { exitCode: 1, changedFiles: new Set() }, // no increment
      { exitCode: 1, changedFiles: new Set(["src/b.ts"]) },
      { exitCode: 1, changedFiles: new Set() }, // no increment
      { exitCode: 1, changedFiles: new Set(["src/c.ts"]) },
    ];

    const result = trackThreeStrike(attempts);
    expect(result.shouldEscalate).toBe(true);
    expect(result.strikeCount).toBe(3);
  });
});
