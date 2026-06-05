/**
 * Skill feedback analysis and cross-validation.
 *
 * Extracted from learn.ts for independent testability.
 *
 * Property 24 (Self-evolution Phase 1-2):
 *   - Commands with >30% failure rate are flagged
 *   - Failure reasons are aggregated and ranked by frequency
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single skill execution feedback entry.
 */
export interface SkillFeedbackEntry {
  /** The forge command that was executed, e.g. "build", "review", "plan". */
  command: string;
  /** Whether the execution succeeded. */
  success: boolean;
  /** Execution duration in seconds (0 if unknown). */
  durationSeconds: number;
  /** Failure reason (empty string if success). */
  failureReason: string;
}

/**
 * Aggregated statistics for a single command.
 */
export interface CommandStats {
  command: string;
  totalRuns: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgDurationSeconds: number;
  /** Top failure reasons sorted by frequency (most common first). */
  topFailureReasons: { reason: string; count: number }[];
}

/**
 * Result of analyzing skill feedback entries.
 */
export interface FeedbackAnalysis {
  /** Per-command statistics. */
  commandStats: CommandStats[];
  /** Commands with failure rate above the alert threshold. */
  alertCommands: string[];
  /** Total entries analyzed. */
  totalEntries: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Failure rate threshold above which a command is flagged for attention. */
export const FAILURE_RATE_ALERT_THRESHOLD = 0.3;

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Analyze a collection of skill feedback entries.
 *
 * Groups entries by command, computes success/failure rates, average duration,
 * and identifies commands with failure rates above the alert threshold (30%).
 *
 * Per design Property 24 (Self-evolution Phase 2):
 *   - Commands with >30% failure rate are flagged
 *   - Failure reasons are aggregated and ranked by frequency
 */
export function analyzeSkillFeedback(entries: SkillFeedbackEntry[]): FeedbackAnalysis {
  if (entries.length === 0) {
    return { commandStats: [], alertCommands: [], totalEntries: 0 };
  }

  // Group by command
  const groups = new Map<string, SkillFeedbackEntry[]>();
  for (const entry of entries) {
    const key = entry.command;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)?.push(entry);
  }

  const commandStats: CommandStats[] = [];

  for (const [command, commandEntries] of groups) {
    const totalRuns = commandEntries.length;
    const successCount = commandEntries.filter((e) => e.success).length;
    const failureCount = totalRuns - successCount;
    const successRate = totalRuns > 0 ? successCount / totalRuns : 0;

    // Average duration (only count entries with known duration > 0)
    const durationsWithValue = commandEntries.map((e) => e.durationSeconds).filter((d) => d > 0);
    const avgDurationSeconds =
      durationsWithValue.length > 0
        ? durationsWithValue.reduce((a, b) => a + b, 0) / durationsWithValue.length
        : 0;

    // Aggregate failure reasons
    const reasonCounts = new Map<string, number>();
    for (const entry of commandEntries) {
      if (!entry.success && entry.failureReason.trim().length > 0) {
        const reason = entry.failureReason.trim();
        reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      }
    }
    const topFailureReasons = [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    commandStats.push({
      command,
      totalRuns,
      successCount,
      failureCount,
      successRate,
      avgDurationSeconds,
      topFailureReasons,
    });
  }

  // Sort by failure rate descending (worst first)
  commandStats.sort((a, b) => a.successRate - b.successRate);

  // Flag commands above alert threshold
  const alertCommands = commandStats
    .filter((s) => s.totalRuns >= 2 && 1 - s.successRate >= FAILURE_RATE_ALERT_THRESHOLD)
    .map((s) => s.command);

  return {
    commandStats,
    alertCommands,
    totalEntries: entries.length,
  };
}

/**
 * Check if a specific failure reason appears in both skill feedback and known failures.
 *
 * This is the cross-validation step from Phase 2: if a failure reason from
 * skill-feedback.md also appears in known-failures.md, it's a confirmed
 * recurring pattern that should be prioritized.
 *
 * @param feedbackReasons - Failure reasons from skill feedback analysis
 * @param knownFailureDescriptions - Descriptions from known-failures.md
 * @returns Reasons that appear in both sources (confirmed recurring patterns)
 */
export function crossValidateFailures(
  feedbackReasons: string[],
  knownFailureDescriptions: string[],
): string[] {
  if (feedbackReasons.length === 0 || knownFailureDescriptions.length === 0) {
    return [];
  }

  const knownLower = knownFailureDescriptions.map((d) => d.toLowerCase());

  return feedbackReasons.filter((reason) => {
    const reasonLower = reason.toLowerCase();
    return knownLower.some((known) => known.includes(reasonLower) || reasonLower.includes(known));
  });
}
