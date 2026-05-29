/**
 * Tests for truncation detection integration into the review pipeline.
 *
 * Tests the `processReviewTruncation` function which takes review subagent
 * results from the fallback ladder, maps agentType→layer, runs truncation
 * detection, and returns a TruncationAssessment.
 */

import { describe, expect, it } from "vitest";
import { processReviewTruncation } from "../src/review.js";
import type { TruncationAssessment } from "../src/truncation-detection.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COMPLETE_REPORT = `## Layer 1 — Spec Alignment

<!-- REPORT_START -->
## Layer 1: spec-check Review

### P0 Issues
None

### P1 Issues
None

### Summary
All good.
<!-- REPORT_END -->

<!-- review-final -->`;

const TRUNCATED_OUTPUT = `Reading diff context...

Now let me check the auth middleware...`;

const COMPLETE_QUALITY = `## Layer 2 — Code Quality

<!-- REPORT_START -->
## Layer 2: quality-check Review

### P0 Issues
None

### P1 Issues
None

### Summary
Clean.
<!-- REPORT_END -->

<!-- review-final -->`;

const COMPLETE_SECURITY = `## Layer 3 — Security & Risk

<!-- REPORT_START -->
## Layer 3: security-check Review

### P0 Issues
None

### P1 Issues
None

### Summary
No issues.
<!-- REPORT_END -->

<!-- review-final -->`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processReviewTruncation", () => {
  it("returns proceed when all 3 layers are complete", () => {
    const results = [
      { agentType: "spec-check", result: COMPLETE_REPORT },
      { agentType: "quality-check", result: COMPLETE_QUALITY },
      { agentType: "security-check", result: COMPLETE_SECURITY },
    ];

    const assessment = processReviewTruncation(results);
    expect(assessment.action).toBe("proceed");
    expect(assessment.truncatedCount).toBe(0);
    expect(assessment.totalCount).toBe(3);
    expect(assessment.truncatedLayers).toEqual([]);
  });

  it("returns annotate when 1 layer is truncated", () => {
    const results = [
      { agentType: "spec-check", result: TRUNCATED_OUTPUT },
      { agentType: "quality-check", result: COMPLETE_QUALITY },
      { agentType: "security-check", result: COMPLETE_SECURITY },
    ];

    const assessment = processReviewTruncation(results);
    expect(assessment.action).toBe("annotate");
    expect(assessment.truncatedCount).toBe(1);
    expect(assessment.truncatedLayers).toContain("spec");
  });

  it("returns warn when 2 layers are truncated", () => {
    const results = [
      { agentType: "spec-check", result: TRUNCATED_OUTPUT },
      { agentType: "quality-check", result: TRUNCATED_OUTPUT },
      { agentType: "security-check", result: COMPLETE_SECURITY },
    ];

    const assessment = processReviewTruncation(results);
    expect(assessment.action).toBe("warn");
    expect(assessment.truncatedCount).toBe(2);
  });

  it("returns degrade when all 3 layers are truncated", () => {
    const results = [
      { agentType: "spec-check", result: TRUNCATED_OUTPUT },
      { agentType: "quality-check", result: TRUNCATED_OUTPUT },
      { agentType: "security-check", result: TRUNCATED_OUTPUT },
    ];

    const assessment = processReviewTruncation(results);
    expect(assessment.action).toBe("degrade");
    expect(assessment.truncatedCount).toBe(3);
    expect(assessment.truncatedLayers).toEqual(["spec", "quality", "security"]);
  });

  it("works with 2-layer lightweight review (no spec)", () => {
    const results = [
      { agentType: "quality-check", result: COMPLETE_QUALITY },
      { agentType: "security-check", result: COMPLETE_SECURITY },
    ];

    const assessment = processReviewTruncation(results);
    expect(assessment.action).toBe("proceed");
    expect(assessment.totalCount).toBe(2);
  });

  it("handles frontend-check gracefully (skipped, not a review layer)", () => {
    const results = [
      { agentType: "spec-check", result: COMPLETE_REPORT },
      { agentType: "quality-check", result: COMPLETE_QUALITY },
      { agentType: "security-check", result: COMPLETE_SECURITY },
      { agentType: "frontend-check", result: "some frontend output" },
    ];

    const assessment = processReviewTruncation(results);
    expect(assessment.action).toBe("proceed");
    expect(assessment.totalCount).toBe(3); // frontend-check not counted
  });

  it("returns valid TruncationAssessment shape", () => {
    const results = [
      { agentType: "spec-check", result: COMPLETE_REPORT },
      { agentType: "quality-check", result: COMPLETE_QUALITY },
      { agentType: "security-check", result: COMPLETE_SECURITY },
    ];

    const assessment = processReviewTruncation(results);
    expect(assessment).toHaveProperty("action");
    expect(assessment).toHaveProperty("truncatedCount");
    expect(assessment).toHaveProperty("totalCount");
    expect(assessment).toHaveProperty("truncatedLayers");
  });

  it("is a pure function — same input produces same output", () => {
    const results = [
      { agentType: "spec-check", result: TRUNCATED_OUTPUT },
      { agentType: "quality-check", result: COMPLETE_QUALITY },
      { agentType: "security-check", result: COMPLETE_SECURITY },
    ];

    const a1 = processReviewTruncation(results);
    const a2 = processReviewTruncation(results);
    expect(a1).toEqual(a2);
  });

  it("handles empty results array", () => {
    const assessment = processReviewTruncation([]);
    expect(assessment.action).toBe("proceed");
    expect(assessment.truncatedCount).toBe(0);
    expect(assessment.totalCount).toBe(0);
  });

  it("handles unknown agentType gracefully", () => {
    const results = [
      { agentType: "spec-check", result: COMPLETE_REPORT },
      { agentType: "quality-check", result: COMPLETE_QUALITY },
      { agentType: "security-check", result: COMPLETE_SECURITY },
      { agentType: "unknown-agent", result: "whatever" },
    ];

    const assessment = processReviewTruncation(results);
    expect(assessment.action).toBe("proceed");
    expect(assessment.totalCount).toBe(3); // unknown agent skipped
  });
});
