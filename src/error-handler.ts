// ---------------------------------------------------------------------------
// Error Handling & Degradation — exit code classification, backoff, retry
// ---------------------------------------------------------------------------

export const STUCK_TIMEOUT_MS = 600_000; // 10 minutes
export const MAX_RETRY_ATTEMPTS = 3;
export const DEFAULT_BACKOFF_BASE_MS = 60_000; // 1 minute

export const RETRYABLE_EXIT_CODES = new Set([1, 2, 137, 143]);

export interface ExitCodeClassification {
  retryable: boolean;
  category: "success" | "general_error" | "usage_error" | "sigkill" | "sigterm" | "fatal";
}

export function classifyExitCode(code: number): ExitCodeClassification {
  if (code === 0) return { retryable: false, category: "success" };
  if (!RETRYABLE_EXIT_CODES.has(code)) return { retryable: false, category: "fatal" };

  const categoryMap: Record<number, ExitCodeClassification["category"]> = {
    1: "general_error",
    2: "usage_error",
    137: "sigkill",
    143: "sigterm",
  };

  return {
    retryable: true,
    category: categoryMap[code] ?? "fatal",
  };
}

export function computeBackoffDelay(attempt: number): number {
  return DEFAULT_BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
}

export function shouldRetry(exitCode: number, currentAttempt: number): boolean {
  if (currentAttempt >= MAX_RETRY_ATTEMPTS) return false;
  return classifyExitCode(exitCode).retryable;
}
