/**
 * E2E tests for subagent truncation detection and degradation.
 *
 * Simulates high tool_use scenarios where subagent outputs are
 * truncated or complete, verifying the full detection + degradation pipeline.
 */

import { describe, expect, it } from "vitest";
import {
  assessTruncationSeverity,
  detectTruncation,
  type LayerResult,
} from "../src/truncation-detection.js";

// ---------------------------------------------------------------------------
// Fixtures: Simulated subagent outputs
// ---------------------------------------------------------------------------

/** Simulates a spec-check subagent that ran out of turns mid-report. */
const TRUNCATED_SPEC_OUTPUT = `Reading spec files...

## Layer 1 — Spec Alignment

| # | Severity | Requirement/Scenario | Status | Note |
|---|----------|---------------------|--------|------|
| 1 | P1 | 需求 2 场景 S3 | ❌ 未实现 | 缺少异步导出逻辑 |

<!-- REPORT_START -->
## Layer 1: spec-check Review

### P0 Issues
1. Feature X not implemented on main branch

### P1 Issues`;

/** Simulates a quality-check that completed normally. */
const COMPLETE_QUALITY_OUTPUT = `## Layer 2 — Code Quality

| # | Severity | File:Line | Issue | Suggestion |
|---|----------|-----------|-------|------------|
| 1 | P2 | src/routes.ts:42 | 深层嵌套 | 使用 early return |

<!-- REPORT_START -->
## Layer 2: quality-check Review

### P0 Issues
None

### P1 Issues
None

### P2 Issues
1. src/routes.ts:42 — deep nesting

### P3 Issues
None

### Summary
One P2 issue found: deep nesting in route handler.
<!-- REPORT_END -->

<!-- review-final -->`;

/** Simulates a security-check that was cut off entirely (no markers). */
const TRUNCATED_SECURITY_OUTPUT = `Reading diff context...

Now let me check the auth middleware...

Found some issues with token handling.`;

/** Complete security-check output. */
const COMPLETE_SECURITY_OUTPUT = `## Layer 3 — Security & Risk

| # | Severity | File:Line | Issue | Suggestion |
|---|----------|-----------|-------|------------|

<!-- REPORT_START -->
## Layer 3: security-check Review

### P0 Issues
None

### P1 Issues
None

### P2 Issues
None

### P3 Issues
None

### Summary
No security issues found.
<!-- REPORT_END -->

<!-- review-final -->`;

/** Complete spec-check output. */
const COMPLETE_SPEC_OUTPUT = `## Layer 1 — Spec Alignment

| # | Severity | Requirement/Scenario | Status | Note |
|---|----------|---------------------|--------|------|
| 3 | — | 需求 1 场景 S1 | ✅ 已实现 | — |

<!-- REPORT_START -->
## Layer 1: spec-check Review

### P0 Issues
None

### P1 Issues
None

### P2 Issues
None

### P3 Issues
None

### Summary
Spec fully implemented.
<!-- REPORT_END -->

<!-- review-final -->`;

// ---------------------------------------------------------------------------
// E2E: Full pipeline scenarios
// ---------------------------------------------------------------------------

describe("E2E: Normal review (no truncation)", () => {
  it("all three layers complete → proceed", () => {
    const results: LayerResult[] = [
      detectTruncation("spec", COMPLETE_SPEC_OUTPUT),
      detectTruncation("quality", COMPLETE_QUALITY_OUTPUT),
      detectTruncation("security", COMPLETE_SECURITY_OUTPUT),
    ];

    expect(results.every((r) => !r.truncated)).toBe(true);

    const assessment = assessTruncationSeverity(results);
    expect(assessment.action).toBe("proceed");
    expect(assessment.truncatedCount).toBe(0);
  });
});

describe("E2E: High tool_use scenario — spec-check truncated", () => {
  it("spec truncated, others complete → annotate spec layer", () => {
    const results: LayerResult[] = [
      detectTruncation("spec", TRUNCATED_SPEC_OUTPUT),
      detectTruncation("quality", COMPLETE_QUALITY_OUTPUT),
      detectTruncation("security", COMPLETE_SECURITY_OUTPUT),
    ];

    expect(results[0].truncated).toBe(true);
    expect(results[1].truncated).toBe(false);
    expect(results[2].truncated).toBe(false);

    const assessment = assessTruncationSeverity(results);
    expect(assessment.action).toBe("annotate");
    expect(assessment.truncatedLayers).toEqual(["spec"]);
  });
});

describe("E2E: High tool_use scenario — 2 layers truncated", () => {
  it("spec + security truncated → warn", () => {
    const results: LayerResult[] = [
      detectTruncation("spec", TRUNCATED_SPEC_OUTPUT),
      detectTruncation("quality", COMPLETE_QUALITY_OUTPUT),
      detectTruncation("security", TRUNCATED_SECURITY_OUTPUT),
    ];

    const assessment = assessTruncationSeverity(results);
    expect(assessment.action).toBe("warn");
    expect(assessment.truncatedCount).toBe(2);
  });
});

describe("E2E: Worst case — all 3 layers truncated", () => {
  it("all truncated → degrade (L2 serial retry)", () => {
    const results: LayerResult[] = [
      detectTruncation("spec", TRUNCATED_SPEC_OUTPUT),
      detectTruncation("quality", TRUNCATED_SECURITY_OUTPUT), // no markers
      detectTruncation("security", TRUNCATED_SECURITY_OUTPUT),
    ];

    expect(results.every((r) => r.truncated)).toBe(true);

    const assessment = assessTruncationSeverity(results);
    expect(assessment.action).toBe("degrade");
    expect(assessment.truncatedCount).toBe(3);
    expect(assessment.truncatedLayers).toHaveLength(3);
  });
});

describe("E2E: Partial report — markers present but cut off", () => {
  it("REPORT_START present, REPORT_END missing → truncated", () => {
    const partialOutput = `Some analysis...
<!-- REPORT_START -->
## Layer 1: spec-check Review
### P0 Issues
None`;

    const result = detectTruncation("spec", partialOutput);
    expect(result.truncated).toBe(true);
    expect(result.report).toBeNull();
  });

  it("REPORT_END present before REPORT_START → truncated", () => {
    const reversedOutput = `<!-- REPORT_END -->
Some preamble
<!-- REPORT_START -->
### P0 Issues
None
### Summary
Clean`;

    const result = detectTruncation("spec", reversedOutput);
    expect(result.truncated).toBe(true);
  });
});

describe("E2E: Marker detection edge cases", () => {
  it("markers in code blocks are still detected (acceptable false positive)", () => {
    // If markers appear in code blocks, they'll be detected.
    // This is acceptable because subagent outputs are Markdown, not code.
    const outputWithCodeBlock = `\`\`\`html
<!-- REPORT_START -->
<div>Hello</div>
<!-- REPORT_END -->
\`\`\``;

    const result = detectTruncation("quality", outputWithCodeBlock);
    // Markers are found but report won't have required sections → truncated
    expect(result.truncated).toBe(true);
  });

  it("multiple REPORT_START/END pairs uses last one", () => {
    const multiBlockOutput = `<!-- REPORT_START -->
### P0 Issues
None
### Summary
First
<!-- REPORT_END -->

Some retry output...

<!-- REPORT_START -->
## Layer 2: quality-check Review

### P0 Issues
None

### P1 Issues
1. A real finding

### Summary
Retry found one P1 issue.
<!-- REPORT_END -->`;

    const result = detectTruncation("quality", multiBlockOutput);
    expect(result.truncated).toBe(false);
    expect(result.report).toContain("Retry found one P1 issue");
  });

  it("empty string → truncated", () => {
    const result = detectTruncation("security", "");
    expect(result.truncated).toBe(true);
    expect(result.report).toBeNull();
  });

  it("only whitespace → truncated", () => {
    const result = detectTruncation("spec", "   \n\t  \n  ");
    expect(result.truncated).toBe(true);
    expect(result.report).toBeNull();
  });
});

describe("E2E: Lightweight review (no spec layer)", () => {
  it("both quality+security complete → proceed", () => {
    const results: LayerResult[] = [
      detectTruncation("quality", COMPLETE_QUALITY_OUTPUT),
      detectTruncation("security", COMPLETE_SECURITY_OUTPUT),
    ];

    const assessment = assessTruncationSeverity(results);
    expect(assessment.action).toBe("proceed");
    expect(assessment.totalCount).toBe(2);
  });

  it("both quality+security truncated → warn (not degrade, since < 3 layers)", () => {
    const results: LayerResult[] = [
      detectTruncation("quality", TRUNCATED_SECURITY_OUTPUT),
      detectTruncation("security", TRUNCATED_SECURITY_OUTPUT),
    ];

    const assessment = assessTruncationSeverity(results);
    expect(assessment.action).toBe("warn");
    expect(assessment.truncatedCount).toBe(2);
  });
});

describe("E2E: Truncated report preserves raw for re-parsing", () => {
  it("raw output is always available even when truncated", () => {
    const raw = "Now let me check the auth middleware...";
    const result = detectTruncation("security", raw);

    expect(result.truncated).toBe(true);
    expect(result.raw).toBe(raw);
    // Raw can be re-processed if needed for partial extraction
  });
});
