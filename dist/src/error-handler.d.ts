export declare const STUCK_TIMEOUT_MS = 600000;
export declare const MAX_RETRY_ATTEMPTS = 3;
export declare const DEFAULT_BACKOFF_BASE_MS = 60000;
export declare const RETRYABLE_EXIT_CODES: Set<number>;
export interface ExitCodeClassification {
    retryable: boolean;
    category: "success" | "general_error" | "usage_error" | "sigkill" | "sigterm" | "fatal";
}
export declare function classifyExitCode(code: number): ExitCodeClassification;
export declare function computeBackoffDelay(attempt: number): number;
export declare function shouldRetry(exitCode: number, currentAttempt: number): boolean;
