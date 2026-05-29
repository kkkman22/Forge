/**
 * Unit tests for subagent result truncation detection.
 *
 * Tests the pure function `detectTruncation` which checks whether
 * a subagent's output contains a complete REPORT_START...REPORT_END block.
 *
 * Property: detectTruncation is a pure function — same input always produces same output.
 */

import { describe, expect, it } from "vitest";
import {
  detectTruncation,
  REPORT_END_MARKER,
  REPORT_START_MARKER,
} from "../src/truncation-detection.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COMPLETE_REPORT = `Some preamble text here.

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
No issues found. Spec is fully implemented.
<!-- REPORT_END -->`;

const COMPLETE_REPORT_WITH_FINDINGS = `Let me check the files...

<!-- REPORT_START -->
## Layer 2: quality-check Review

### P0 Issues
None

### P1 Issues
1. src/routes/export.ts:42 — missing error handling

### P2 Issues
1. src/services/export.ts:15 — duplicated logic

### P3 Issues
None

### Summary
One P1 issue found related to error handling.
<!-- REPORT_END -->`;

const NO_MARKERS = `Some analysis text here.
No report markers at all.
Just plain text output from the subagent.`;

const MISSING_END_MARKER = `<!-- REPORT_START -->
## Layer 3: security-check Review

### P0 Issues
None

### P1 Issues
None`;

const MISSING_START_MARKER = `## Layer 1: spec-check Review

### P0 Issues
None

### P1 Issues
None

<!-- REPORT_END -->`;

const INCOMPLETE_REPORT = `<!-- REPORT_START -->
## Layer 2: quality-check Review

### P0 Issues
None

### P1 Issues
1. src/routes/export.ts:42`;

const END_BEFORE_START = `<!-- REPORT_END -->
Some text
<!-- REPORT_START -->
## Layer 1
### P0 Issues
None
`;

const EMPTY_OUTPUT = "";

const REPORT_MISSING_P0_SECTION = `<!-- REPORT_START -->
## Layer 1: spec-check Review

### P1 Issues
None

### P2 Issues
None

### P3 Issues
None

### Summary
No issues found.
<!-- REPORT_END -->`;

const REPORT_MISSING_SUMMARY = `<!-- REPORT_START -->
## Layer 1: spec-check Review

### P0 Issues
None

### P1 Issues
None

### P2 Issues
None

### P3 Issues
None
<!-- REPORT_END -->`;

const MULTIPLE_REPORT_BLOCKS = `First block:
<!-- REPORT_START -->
## Layer 1
### P0 Issues
None
### Summary
First summary
<!-- REPORT_END -->

Second block (should be used):
<!-- REPORT_START -->
## Layer 2
### P0 Issues
None
### P1 Issues
None
### Summary
Second summary
<!-- REPORT_END -->`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectTruncation", () => {
  // --- Complete reports: truncated = false ---

  it("returns truncated=false for a complete report with no findings", () => {
    const result = detectTruncation("spec", COMPLETE_REPORT);
    expect(result.truncated).toBe(false);
    expect(result.layer).toBe("spec");
    expect(result.report).not.toBeNull();
    expect(result.raw).toBe(COMPLETE_REPORT);
  });

  it("returns truncated=false for a complete report with findings", () => {
    const result = detectTruncation("quality", COMPLETE_REPORT_WITH_FINDINGS);
    expect(result.truncated).toBe(false);
    expect(result.layer).toBe("quality");
    expect(result.report).not.toBeNull();
  });

  it("extracts report content between markers correctly", () => {
    const result = detectTruncation("spec", COMPLETE_REPORT);
    expect(result.report).toContain(REPORT_START_MARKER);
    expect(result.report).toContain(REPORT_END_MARKER);
    expect(result.report).toContain("P0 Issues");
    expect(result.report).toContain("Summary");
  });

  // --- No markers: truncated = true ---

  it("returns truncated=true when no markers are present", () => {
    const result = detectTruncation("spec", NO_MARKERS);
    expect(result.truncated).toBe(true);
    expect(result.report).toBeNull();
  });

  it("returns truncated=true for empty output", () => {
    const result = detectTruncation("security", EMPTY_OUTPUT);
    expect(result.truncated).toBe(true);
    expect(result.report).toBeNull();
  });

  // --- Incomplete reports: truncated = true ---

  it("returns truncated=true when REPORT_END is missing", () => {
    const result = detectTruncation("quality", MISSING_END_MARKER);
    expect(result.truncated).toBe(true);
    expect(result.report).toBeNull();
  });

  it("returns truncated=true when REPORT_START is missing", () => {
    const result = detectTruncation("spec", MISSING_START_MARKER);
    expect(result.truncated).toBe(true);
    expect(result.report).toBeNull();
  });

  it("returns truncated=true when report is cut off mid-section", () => {
    const result = detectTruncation("quality", INCOMPLETE_REPORT);
    expect(result.truncated).toBe(true);
  });

  it("returns truncated=true when END appears before START", () => {
    const result = detectTruncation("spec", END_BEFORE_START);
    expect(result.truncated).toBe(true);
  });

  // --- Required section validation ---

  it("returns truncated=true when P0 Issues section is missing", () => {
    const result = detectTruncation("spec", REPORT_MISSING_P0_SECTION);
    expect(result.truncated).toBe(true);
  });

  it("returns truncated=true when Summary section is missing", () => {
    const result = detectTruncation("spec", REPORT_MISSING_SUMMARY);
    expect(result.truncated).toBe(true);
  });

  // --- Multiple report blocks: uses last one ---

  it("uses the last REPORT_START...REPORT_END block when multiple exist", () => {
    const result = detectTruncation("quality", MULTIPLE_REPORT_BLOCKS);
    expect(result.truncated).toBe(false);
    expect(result.report).toContain("Second summary");
  });

  // --- Layer preservation ---

  it("preserves the layer parameter in the result", () => {
    const layers = ["spec", "quality", "security"] as const;
    for (const layer of layers) {
      const result = detectTruncation(layer, COMPLETE_REPORT);
      expect(result.layer).toBe(layer);
    }
  });

  // --- Raw preservation ---

  it("always preserves the raw input", () => {
    const cases = [COMPLETE_REPORT, NO_MARKERS, EMPTY_OUTPUT, INCOMPLETE_REPORT];
    for (const raw of cases) {
      const result = detectTruncation("spec", raw);
      expect(result.raw).toBe(raw);
    }
  });

  // --- Purity: same input always produces same output ---

  it("is a pure function — same input produces same output across calls", () => {
    const result1 = detectTruncation("quality", COMPLETE_REPORT_WITH_FINDINGS);
    const result2 = detectTruncation("quality", COMPLETE_REPORT_WITH_FINDINGS);
    expect(result1).toEqual(result2);
  });

  // --- Type constraint ---

  it("returns a valid LayerResult object", () => {
    const result = detectTruncation("security", COMPLETE_REPORT);
    expect(result).toHaveProperty("layer");
    expect(result).toHaveProperty("raw");
    expect(result).toHaveProperty("report");
    expect(result).toHaveProperty("truncated");
    expect(typeof result.layer).toBe("string");
    expect(typeof result.raw).toBe("string");
    expect(typeof result.truncated).toBe("boolean");
  });
});

describe("REPORT_START_MARKER and REPORT_END_MARKER", () => {
  it("are valid HTML comment markers", () => {
    expect(REPORT_START_MARKER).toBe("<!-- REPORT_START -->");
    expect(REPORT_END_MARKER).toBe("<!-- REPORT_END -->");
  });
});
