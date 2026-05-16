import { describe, expect, it } from "vitest";
import {
  detectRecurrence,
  type KnownFailure,
  type DiffSummary,
} from "../../src/known-failures.js";

function makeFailure(overrides: Partial<KnownFailure> = {}): KnownFailure {
  return {
    pattern_id: "spec-stub-empty-default",
    severity: "P1",
    first_seen: "2026-05-10",
    last_seen: "2026-05-16",
    occurrence_count: 3,
    signature: "stub function returns {} for non-empty input",
    fix_required: "implement actual logic or mark as Zero-Pack no-op",
    ...overrides,
  };
}

function makeDiff(files: string[] = [], changedText: string = ""): DiffSummary {
  return { files, changedText };
}

describe("known-failures — recurrence", () => {
  it("flags P1 recurrence when pattern matched and no fix in diff", () => {
    const failures: KnownFailure[] = [makeFailure()];
    const diff = makeDiff(["src/foo.ts"], "function bar() { return {}; }\n");
    const result = detectRecurrence(failures, diff);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toContain("recurrence");
    expect(result[0]).toContain("spec-stub-empty-default");
  });

  it("does not flag when fix evidence found in diff", () => {
    const failures: KnownFailure[] = [makeFailure()];
    const diff = makeDiff(["src/foo.ts"], "function bar() { return actualData; }\n// fix: implement actual logic");
    const result = detectRecurrence(failures, diff);
    expect(result).toHaveLength(0);
  });

  it("returns empty when no failures match diff patterns", () => {
    const failures: KnownFailure[] = [makeFailure({ signature: "unused import in module X" })];
    const diff = makeDiff(["src/other.ts"], "function bar() { return {}; }\n");
    const result = detectRecurrence(failures, diff);
    expect(result).toHaveLength(0);
  });

  it("lists matched patterns at report head", () => {
    const failures: KnownFailure[] = [
      makeFailure(),
      makeFailure({ pattern_id: "other-pattern", signature: "something else entirely not in diff" }),
    ];
    const diff = makeDiff(["src/foo.ts"], "stub function returns {}");
    const result = detectRecurrence(failures, diff);
    expect(result.some((r) => r.includes("spec-stub-empty-default"))).toBe(true);
  });
});
