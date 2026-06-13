/**
 *
 * Evaluates structured stop conditions against current loop state.
 * Supports: max-iterations, phase-reached, commit-count.
 *
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal loop state slice for stopWhen evaluation. */
export interface StopWhenState {
  totalIterations: number;
  consecutiveFailures: number;
  lastSuccessCommit: string;
  /** Cumulative count of successful commits. When present, drives commit-count; falls back to the binary lastSuccessCommit check otherwise. */
  successCommitCount?: number;
  phase: string;
  haltReason: string;
}

/** Parsed stop condition. */
export interface ParsedCondition {
  type: "max-iterations" | "phase-reached" | "commit-count";
  value: number | string;
}

/** Result of stopWhen evaluation. */
export interface StopWhenResult {
  shouldStop: boolean;
  reason: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a structured stop condition string.
 *
 * Supported formats:
 * - `max-iterations:N` — stop after N total iterations
 * - `phase-reached:<phase>` — stop when entering the named phase
 * - `commit-count:N` — stop after at least N success commits
 */
export function parseStopCondition(condition: string): ParsedCondition | null {
  if (!condition) return null;

  const iterMatch = condition.match(/^max-iterations:(\d+)$/);
  if (iterMatch) {
    const n = Number(iterMatch[1]);
    if (n <= 0) return null;
    return { type: "max-iterations", value: n };
  }

  const phaseMatch = condition.match(/^phase-reached:([a-z-]+)$/);
  if (phaseMatch) {
    return { type: "phase-reached", value: phaseMatch[1] };
  }

  const commitMatch = condition.match(/^commit-count:(\d+)$/);
  if (commitMatch) {
    const n = Number(commitMatch[1]);
    if (n <= 0) return null;
    return { type: "commit-count", value: n };
  }

  return null;
}

/**
 * Evaluate a stop condition against current loop state.
 */
export function evaluateStopWhen(condition: string, state: StopWhenState): StopWhenResult {
  if (!condition) {
    return { shouldStop: false, reason: "" };
  }

  const parsed = parseStopCondition(condition);
  if (!parsed) {
    return { shouldStop: false, reason: "" };
  }

  switch (parsed.type) {
    case "max-iterations": {
      const max = parsed.value as number;
      if (state.totalIterations >= max) {
        return {
          shouldStop: true,
          reason: `max-iterations reached: ${state.totalIterations}/${max}`,
        };
      }
      return { shouldStop: false, reason: "" };
    }

    case "phase-reached": {
      const target = parsed.value as string;
      if (state.phase === target) {
        return {
          shouldStop: true,
          reason: `phase-reached: ${target}`,
        };
      }
      return { shouldStop: false, reason: "" };
    }

    case "commit-count": {
      const target = parsed.value as number;
      // Prefer the cumulative counter when the driver tracks it, so that
      // commit-count:N for N>1 is reachable. Fall back to the legacy binary
      // check (non-empty lastSuccessCommit ⇒ 1) for callers that haven't
      // adopted successCommitCount yet — keeps commit-count:1 working.
      const current =
        state.successCommitCount ?? (state.lastSuccessCommit !== "" ? 1 : 0);
      if (current >= target) {
        return {
          shouldStop: true,
          reason: `commit-count reached: ${current}/${target}`,
        };
      }
      return { shouldStop: false, reason: "" };
    }

    default:
      return { shouldStop: false, reason: "" };
  }
}
