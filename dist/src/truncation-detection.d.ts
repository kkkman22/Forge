/**
 * Subagent result truncation detection.
 *
 * Pure functions for detecting whether a review subagent's output
 * contains a complete structured report (REPORT_START...REPORT_END).
 */
/** Opening marker for structured review report. */
export declare const REPORT_START_MARKER = "<!-- REPORT_START -->";
/** Closing marker for structured review report. */
export declare const REPORT_END_MARKER = "<!-- REPORT_END -->";
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
/**
 * Markdown template for the structured review report block.
 *
 * Subagents must wrap their findings in REPORT_START...REPORT_END markers
 * following this exact structure. Empty sections must contain "None" rather
 * than being omitted — this ensures the report is parseable even when clean.
 *
 * Estimated token cost: ~200-500 tokens.
 */
export declare const REPORT_TEMPLATE = "<!-- REPORT_START -->\n## Layer N: <layer-name> Review\n\n### P0 Issues\n<list or \"None\">\n\n### P1 Issues\n<list or \"None\">\n\n### P2 Issues\n<list or \"None\">\n\n### P3 Issues\n<list or \"None\">\n\n### Summary\n<1-2 sentence summary>\n<!-- REPORT_END -->";
/**
 * Minimum sections that must appear in a valid report block.
 * Used by detectTruncation to distinguish "complete but clean" from "truncated".
 */
export declare const REQUIRED_SECTIONS: readonly ["P0 Issues", "Summary"];
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
export declare function detectTruncation(layer: ReviewLayer, raw: string): LayerResult;
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
/**
 * Assess truncation severity across all review layer results.
 *
 * Strategy:
 *   - 0 layers truncated → "proceed"
 *   - 1 layer truncated → "annotate" (output + "[数据不完整]")
 *   - 2 layers truncated → "warn" (output warning, suggest re-run)
 *   - All layers truncated → "degrade" (trigger L2 serial retry)
 */
export declare function assessTruncationSeverity(results: LayerResult[]): TruncationAssessment;
