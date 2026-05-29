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
// Truncation Detection
// ---------------------------------------------------------------------------

/**
 * Detect whether a subagent's raw output contains a complete structured report.
 *
 * Uses `lastIndexOf` to find the final REPORT_START/REPORT_END pair,
 * which handles the case of multiple report blocks (e.g. from retries).
 * Extracts the content between markers and validates that required
 * sections ("P0 Issues", "Summary") are present.
 *
 * @param layer - The review layer identifier.
 * @param raw - The raw subagent output text.
 * @returns A LayerResult indicating whether the output is truncated.
 */
export function detectTruncation(layer: ReviewLayer, raw: string): LayerResult {
  const startIdx = raw.lastIndexOf(REPORT_START_MARKER);
  const endIdx = raw.lastIndexOf(REPORT_END_MARKER);

  // Missing markers or inverted order → truncated
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return { layer, raw, report: null, truncated: true };
  }

  const report = raw.substring(startIdx, endIdx + REPORT_END_MARKER.length);

  // Check required sections are present in the extracted block
  const hasRequiredSections = REQUIRED_SECTIONS.every((section) => report.includes(section));

  return {
    layer,
    raw,
    report,
    truncated: !hasRequiredSections,
  };
}

// ---------------------------------------------------------------------------
// Degradation Strategy Types
// ---------------------------------------------------------------------------

/** Action to take based on truncation severity across all layers. */
export type DegradationAction = "proceed" | "annotate" | "warn" | "degrade";

/** Result of assessing truncation severity across all review layers. */
export interface TruncationAssessment {
  /** The action to take. */
  action: DegradationAction;
  /** Number of truncated layers. */
  truncatedCount: number;
  /** Total number of layers reviewed. */
  totalCount: number;
  /** Names of truncated layers. */
  truncatedLayers: ReviewLayer[];
}

// ---------------------------------------------------------------------------
// Degradation Strategy (stub — to be replaced in GREEN phase)
// ---------------------------------------------------------------------------

/**
 * Assess truncation severity across all review layer results.
 *
 * Strategy:
 *   - 0 layers truncated → "proceed"
 *   - 1 layer truncated → "annotate" (output + "[数据不完整]")
 *   - 2 layers truncated → "warn" (output warning, suggest re-run)
 *   - All layers truncated → "degrade" (trigger L2 serial retry)
 */
export function assessTruncationSeverity(results: LayerResult[]): TruncationAssessment {
  const truncatedLayers = results.filter((r) => r.truncated).map((r) => r.layer);
  const truncatedCount = truncatedLayers.length;
  const totalCount = results.length;

  let action: DegradationAction = "proceed";

  if (truncatedCount === totalCount && totalCount >= 3) {
    // All 3 review layers truncated → trigger L2 serial retry
    action = "degrade";
  } else if (truncatedCount >= 2) {
    // Majority truncated → warn, suggest re-run
    action = "warn";
  } else if (truncatedCount === 1) {
    // Single layer truncated → annotate with "[数据不完整]"
    action = "annotate";
  }

  return { action, truncatedCount, totalCount, truncatedLayers };
}
