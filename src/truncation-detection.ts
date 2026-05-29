/**
 * Subagent result truncation detection.
 *
 * Pure functions for detecting whether a review subagent's output
 * contains a complete structured report (REPORT_START...REPORT_END).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Opening marker for structured review report. */
export const REPORT_START_MARKER = "<!-- REPORT_START -->";

/** Closing marker for structured review report. */
export const REPORT_END_MARKER = "<!-- REPORT_END -->";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The three review layers. */
export type ReviewLayer = "spec" | "quality" | "security";

/** Result of truncation detection on a single layer's output. */
export interface LayerResult {
  /** Which review layer this result belongs to. */
  layer: ReviewLayer;
  /** The raw subagent output, preserved verbatim. */
  raw: string;
  /** Extracted report content between markers, or null if markers are missing/invalid. */
  report: string | null;
  /** Whether the output is considered truncated (incomplete or missing report). */
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Structured Report Template
// ---------------------------------------------------------------------------

/**
 * Markdown template for the structured review report block.
 *
 * Subagents must wrap their findings in REPORT_START...REPORT_END markers
 * following this exact structure. Empty sections must contain "None" rather
 * than being omitted — this ensures the report is parseable even when clean.
 *
 * Estimated token cost: ~200-500 tokens.
 */
export const REPORT_TEMPLATE = `${REPORT_START_MARKER}
## Layer N: <layer-name> Review

### P0 Issues
<list or "None">

### P1 Issues
<list or "None">

### P2 Issues
<list or "None">

### P3 Issues
<list or "None">

### Summary
<1-2 sentence summary>
${REPORT_END_MARKER}`;

/**
 * Minimum sections that must appear in a valid report block.
 * Used by detectTruncation to distinguish "complete but clean" from "truncated".
 */
export const REQUIRED_SECTIONS = ["P0 Issues", "Summary"] as const;

// ---------------------------------------------------------------------------
// Stub — to be replaced in GREEN phase (Task 6)
// ---------------------------------------------------------------------------

/**
 * Detect whether a subagent's raw output contains a complete structured report.
 *
 * @param _layer - The review layer identifier.
 * @param _raw - The raw subagent output text.
 * @returns A LayerResult indicating whether the output is truncated.
 */
export function detectTruncation(_layer: ReviewLayer, _raw: string): LayerResult {
  return {
    layer: _layer,
    raw: _raw,
    report: null,
    truncated: true,
  };
}
