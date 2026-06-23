/**
 * Integration tests for guarded-merger — 4 guarded file merge functions.
 *
 * Covers [R7.6-R7.9]:
 *   - mergeProgressFile: task_id merge, completed > pending
 *   - mergeInstinctsOrFailures: confidence=max, count=sum
 *   - mergeReviewsFile: append + sort by (layer, severity)
 *   - reassignAdrId: sequential ID reassignment
 *
 * **Validates: Requirements R7.6, R7.7, R7.8, R7.9**
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  mergeInstinctsOrFailures,
  mergeProgressFile,
  mergeReviewsFile,
  reassignAdrId,
} from "../src/guarded-merger.js";

describe("guarded-merger: mergeProgressFile [R7.6]", () => {
  it("merges non-overlapping tasks from both sides", () => {
    const ours = "- [ ] task-a: Do A\n- [x] task-b: Done B";
    const theirs = "- [ ] task-c: Do C";

    const result = mergeProgressFile(ours, theirs);
    expect(result.resolvedContent).toContain("task-a");
    expect(result.resolvedContent).toContain("task-b");
    expect(result.resolvedContent).toContain("task-c");
  });

  it("completed wins over pending for same task_id", () => {
    const ours = "- [ ] task-a: Do A";
    const theirs = "- [x] task-a: Done A";

    const result = mergeProgressFile(ours, theirs);
    expect(result.resolvedContent).toContain("[x] task-a");
  });

  it("ours wins when both completed (tie-break)", () => {
    const ours = "- [x] task-a: Our version";
    const theirs = "- [x] task-a: Their version";

    const result = mergeProgressFile(ours, theirs);
    expect(result.resolvedContent).toContain("task-a");
  });

  it("handles empty ours", () => {
    const theirs = "- [ ] task-a: Do A";
    const result = mergeProgressFile("", theirs);
    expect(result.resolvedContent).toContain("task-a");
  });

  it("handles empty theirs", () => {
    const ours = "- [x] task-a: Done A";
    const result = mergeProgressFile(ours, "");
    expect(result.resolvedContent).toContain("task-a");
  });
});

// --- REQ-01 (T1): tie-break by real completed_at parsed from content ---

describe("guarded-merger: mergeProgressFile tie-break by real timestamp [REQ-01]", () => {
  it("newer real timestamp wins when both completed (theirs newer)", () => {
    // ours older (1000), theirs newer (2000) — both carry explicit @ ts
    const ours = "- [x] task-a: Our version @ 1000";
    const theirs = "- [x] task-a: Their version @ 2000";

    const result = mergeProgressFile(ours, theirs);

    // tie-break must pick theirs (newer real timestamp), not ours
    expect(result.resolvedContent).toContain("Their version");
    expect(result.resolvedContent).not.toContain("Our version");
    expect(result.warnings.some((w) => w.includes("theirs wins"))).toBe(true);
  });

  it("newer real timestamp wins when both completed (ours newer)", () => {
    const ours = "- [x] task-a: Our version @ 3000";
    const theirs = "- [x] task-a: Their version @ 1000";

    const result = mergeProgressFile(ours, theirs);

    expect(result.resolvedContent).toContain("Our version");
    expect(result.resolvedContent).not.toContain("Their version");
  });

  it("backward compat: both completed without timestamp → deterministic ours-first", () => {
    // no @ ts → sentinel 0 on both → deterministic rule (ours first), reproducible
    const ours = "- [x] task-a: Our version";
    const theirs = "- [x] task-a: Their version";

    const r1 = mergeProgressFile(ours, theirs);
    const r2 = mergeProgressFile(ours, theirs);

    // reproducible (no Date.now non-determinism)
    expect(r1.resolvedContent).toEqual(r2.resolvedContent);
    // ours wins deterministically when equal sentinel
    expect(r1.resolvedContent).toContain("Our version");
  });

  it("mergeProgressFile is deterministic — same input always same output (property)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 50 }), (s) => {
        const ours = `- [x] task-x: ${s}`;
        const r1 = mergeProgressFile(ours, "");
        const r2 = mergeProgressFile(ours, "");
        return r1.resolvedContent === r2.resolvedContent && r1.warnings.length === r2.warnings.length;
      }),
    );
  });
});

describe("guarded-merger: mergeInstinctsOrFailures [R7.7]", () => {
  it("merges entries by id: confidence=max, count=sum", () => {
    const ours = "pattern-1: confidence=0.5 count=3 | Always check null";
    const theirs = "pattern-1: confidence=0.8 count=2 | Always check null";

    const result = mergeInstinctsOrFailures(ours, theirs);
    expect(result.resolvedContent).toContain("confidence=0.8");
    expect(result.resolvedContent).toContain("count=5");
  });

  it("preserves single-side entries verbatim", () => {
    const ours = "pattern-1: confidence=0.7 count=1 | Only in ours";
    const theirs = "pattern-2: confidence=0.6 count=1 | Only in theirs";

    const result = mergeInstinctsOrFailures(ours, theirs);
    expect(result.resolvedContent).toContain("pattern-1");
    expect(result.resolvedContent).toContain("pattern-2");
  });

  it("handles empty input", () => {
    const result = mergeInstinctsOrFailures("", "pattern-1: confidence=0.5 count=1 | Text");
    expect(result.resolvedContent).toContain("pattern-1");
  });
});

describe("guarded-merger: mergeReviewsFile [R7.9]", () => {
  it("appends both sides and sorts by layer then severity", () => {
    const ours = "[quality][P2] src/a.ts: Issue A";
    const theirs = "[security][P0] src/b.ts: Issue B";

    const result = mergeReviewsFile(ours, theirs);
    const lines = result.resolvedContent.split("\n");
    // quality < security alphabetically, so quality comes first
    expect(lines[0]).toContain("quality");
    expect(lines[1]).toContain("security");
  });

  it("sorts by severity within same layer", () => {
    const ours = "[quality][P2] src/a.ts: Issue A";
    const theirs = "[quality][P0] src/b.ts: Issue B";

    const result = mergeReviewsFile(ours, theirs);
    const lines = result.resolvedContent.split("\n");
    expect(lines[0]).toContain("P0");
    expect(lines[1]).toContain("P2");
  });

  it("handles empty ours", () => {
    const theirs = "[security][P1] src/x.ts: Issue";
    const result = mergeReviewsFile("", theirs);
    expect(result.resolvedContent).toContain("security");
  });
});

describe("guarded-merger: reassignAdrId [R7.8]", () => {
  it("reassigns ADR IDs starting from nextId", () => {
    const theirs = "ADR-001: Use PostgreSQL\nADR-002: Monorepo structure";
    const result = reassignAdrId(theirs, 5);
    expect(result.resolvedContent).toContain("ADR-005");
    expect(result.resolvedContent).toContain("ADR-006");
    expect(result.resolvedContent).not.toContain("ADR-001");
  });

  it("pads IDs to 3 digits", () => {
    const theirs = "ADR-001: Decision";
    const result = reassignAdrId(theirs, 10);
    expect(result.resolvedContent).toContain("ADR-010");
  });

  it("preserves non-ADR text", () => {
    const theirs = "Some text\nADR-001: Decision\nMore text";
    const result = reassignAdrId(theirs, 3);
    expect(result.resolvedContent).toContain("Some text");
    expect(result.resolvedContent).toContain("More text");
  });
});
