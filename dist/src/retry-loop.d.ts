export interface RetryLoopOpts {
    driver: {
        run(prompt: string, cwd: string): Promise<{
            exitCode: number;
        }>;
    };
    prompt: string;
    cwd: string;
    runDir: string;
    maxRetries?: number;
    ipcEmitter?: {
        emitWarning(opts: {
            code: string;
            attempt: number;
        }): void;
    };
}
export interface AbortJson {
    final_exit_code: number;
    attempts_made: number;
    failures: Array<{
        exit_code: number;
        timestamp: string;
    }>;
    abort_reason: "max_retries_exhausted" | "fatal_exit_code" | "user_interrupt";
}
export declare function runMainLoopWithRetry(opts: RetryLoopOpts): Promise<void>;
