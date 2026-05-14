/**
 * Completion reporter — pure functions for formatting structured completion
 * and abort summaries at the end of a Forge Loop run.
 *
 * Extracted from SdkDriver to reduce its responsibility surface.
 * All functions are pure: they accept data and return formatted strings.
 *
 * **Validates: Requirements 9.1–9.5**
 */
import { type PerformanceBaseline } from "./logger/index.js";
import type { NotesDocument } from "./loop-types.js";
/** Translation function signature. */
export type TranslateFn = (key: string, params?: Record<string, string>) => string;
/** All data needed to format a completion summary. */
export interface CompletionContext {
    /** Final orchestrator status. */
    status: "idle" | "running" | "waiting" | "aborted" | "stopped";
    /** Total iterations executed. */
    currentIteration: number;
    /** The accumulated notes document. */
    notesDocument: NotesDocument;
    /** User-provided objective. */
    objective: string;
    /** Git branch name for this run. */
    branchName: string;
    /** Routing tier. */
    presetTier: string;
    /** Whether the loop completed normally (SkillScheduler returned "completed"). */
    loopCompletedNormally: boolean;
    /** Number of review-fix loop iterations. */
    reviewFixAttempts: number;
    /** Circuit breaker threshold. */
    maxConsecutiveFailures: number;
    /** Optional callback to read review file content. */
    readReviewFile?: () => string;
    /** Translation function. */
    t: TranslateFn;
}
/**
 * Format a structured completion or abort summary.
 *
 * - **Normal completion**: objective, tier, total iterations, per-phase
 *   pass/fail status, branch name.
 * - **Circuit breaker abort**: unresolved P0/P1 issues list and recovery
 *   suggestions.
 * - **Error abort**: error reason and `/forge resume` suggestion.
 */
export declare function formatCompletionSummary(ctx: CompletionContext, baseline: PerformanceBaseline): string;
/**
 * Build per-phase pass/fail status from the notes document entries.
 *
 * Scans iteration entries for phase information embedded in summaries,
 * and aggregates pass/fail per phase.
 */
export declare function buildPhaseStatusSummary(notesDocument: NotesDocument, t: TranslateFn): string[];
/**
 * Collect unresolved P0/P1 issues from the review file.
 */
export declare function collectUnresolvedIssues(readReviewFile?: () => string): string[];
/**
 * Get the last failure reason from the notes document.
 */
export declare function getLastFailureReason(notesDocument: NotesDocument): string | null;
