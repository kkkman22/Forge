import { describe, expect, it } from "vitest";
import {
  generateAppendBlock,
  mergeKnownFailures,
  parseKnownFailures,
  serializeKnownFailures,
  type KnownFailure,
  type ReviewIssue,
} from "../../src/known-failures.js";

function makeIssue(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    severity: "P1",
    file: "src/foo.ts",
    line: 42,
    message: "stub function returns {} for non-empty input",
    ...overrides,
  };
}

function makeFailure(overrides: Partial<KnownFailure> = {}): KnownFailure {
  return {
    pattern_id: "spec-stub-empty-default",
    severity: "P1",
    first_seen: "2026-05-16",
    last_seen: "2026-05-16",
    occurrence_count: 1,
    signature: "stub function returns {} for non-empty input",
    fix_required: "implement actual logic or mark as Zero-Pack no-op",
    ...overrides,
  };
}

describe("known-failures — append", () => {
  describe("generateAppendBlock", () => {
    it("generates append-block from P0 issue", () => {
      const block = generateAppendBlock(makeIssue({ severity: "P0" }), "abc123");
      expect(block).not.toBeNull();
      expect(block!.pattern_id).toBeTruthy();
      expect(block!.severity).toBe("P0");
      expect(block!.first_seen_commit).toBe("abc123");
      expect(block!.signature).toBeTruthy();
      expect(block!.fix_required).toBeTruthy();
    });

    it("generates append-block from P1 issue", () => {
      const block = generateAppendBlock(makeIssue({ severity: "P1" }), "def456");
      expect(block).not.toBeNull();
      expect(block!.severity).toBe("P1");
    });

    it("returns null for P2 issue (no append)", () => {
      const block = generateAppendBlock(makeIssue({ severity: "P2" }), "abc123");
      expect(block).toBeNull();
    });

    it("returns null for P3 issue (no append)", () => {
      const block = generateAppendBlock(makeIssue({ severity: "P3" }), "abc123");
      expect(block).toBeNull();
    });

    it("generates deterministic pattern_id from same signature", () => {
      const b1 = generateAppendBlock(makeIssue(), "abc");
      const b2 = generateAppendBlock(makeIssue(), "def");
      expect(b1).not.toBeNull();
      expect(b2).not.toBeNull();
      expect(b1!.pattern_id).toBe(b2!.pattern_id);
    });
  });

  describe("mergeKnownFailures", () => {
    it("appends new entries to existing file", () => {
      const existing: KnownFailure[] = [makeFailure()];
      const newBlocks = [generateAppendBlock(makeIssue({ severity: "P0", message: "different issue" }), "new123")!];
      const result = mergeKnownFailures(existing, newBlocks);
      expect(result).toHaveLength(2);
    });

    it("deduplicates by pattern_id — updates last_seen and occurrence_count", () => {
      const existing: KnownFailure[] = [makeFailure()];
      const issue = makeIssue();
      const block = generateAppendBlock(issue, "old123")!;
      // Use the same pattern_id as existing
      const newBlocks = [{ ...block, pattern_id: "spec-stub-empty-default" }];
      const result = mergeKnownFailures(existing, newBlocks);
      expect(result).toHaveLength(1);
      expect(result[0].occurrence_count).toBe(2);
      expect(result[0].last_seen).toBeTruthy();
    });

    it("archives entries when count exceeds 100", () => {
      const existing: KnownFailure[] = Array.from({ length: 101 }, (_, i) =>
        makeFailure({ pattern_id: `pattern-${i}`, first_seen: `2026-05-${String(i % 30 + 1).padStart(2, "0")}`, last_seen: `2026-05-${String(i % 30 + 1).padStart(2, "0")}` }),
      );
      const result = mergeKnownFailures(existing, []);
      expect(result.length).toBeLessThanOrEqual(80);
    });
  });

  describe("parseKnownFailures / serializeKnownFailures", () => {
    it("round-trips known-failures content", () => {
      const failures = [makeFailure()];
      const serialized = serializeKnownFailures(failures);
      const parsed = parseKnownFailures(serialized);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].pattern_id).toBe(failures[0].pattern_id);
      expect(parsed[0].severity).toBe(failures[0].severity);
    });
  });
});
